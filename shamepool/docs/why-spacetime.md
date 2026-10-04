# Why Spacetime

ShamePool has no API server, ORM or websocket layer. Spacetime (Maincloud database `shamepool-mvp`) is the whole backend.

- **Rules live in the database.** Penalty escalation, the balance floor, idempotent flakes (unique `penalty.key = goalId:localDate`), check-in rules (`too_far`, `left_area`, `too_early`, photo attempts), withdrawals with escrow and cooldown, cash-out voting and pool milestones run inside the module (`spacetimedb/src/game.ts`), atomically, next to the data. The pure rules (`logic.ts`, `authLogic.ts`, `billingLogic.ts`) are copied 1:1 from the web app by `scripts/sync-shared.mjs`, so client and server cannot drift.
- **A scheduled reducer enforces deadlines.** `check_deadlines` runs every 60 s (`deadline_tick`), catches up on missed days (up to 7) and settles withdrawals whose cooldown ended. No cron, no worker.
- **Live subscriptions replace polling.** Clients subscribe to public tables filtered by `squad_id`; a flake on one phone reaches another client in about 100 ms (measured). Private data (accounts, billing, bot chat, outbox) is exposed only through per-identity views (`my_user`, `my_account`, `my_billing_plan`, `my_addresses`, `my_payment_methods`, `my_bot_messages`).
- **Outbox pattern for side effects.** Modules do no network I/O. Every money movement queues a row in `outbox` in the same transaction as the state change (`nessie_create_user`, `nessie_create_pool`, `nessie_transfer`, `nessie_withdraw`, `nessie_purchase`). The Next.js bridge (`web/src/server/stdb-bridge.ts`) reads it through the bridge-only view `bridge_outbox`, calls Nessie, and reports with `outbox_done` / `outbox_fail` (5 attempts, backoff) / `outbox_requeue`. Only the bridge identity (claimed once with `claim_bridge`) may do that; other identities get an empty view and `not_bridge`. Spacetime stays the source of truth: a slow Nessie never blocks the app.
- **One type system, client to server.** `spacetime generate` produces the bindings in `web/src/data/live/bindings`; the live hooks map rows to the same types the mock uses, so `NEXT_PUBLIC_DATA_MODE=live` needs no UI change.

## Design notes and deviations

- **Procedures carry the app actions.** A reducer cannot both commit and report an error, and cannot return the created entity. Failed logins (lockout counters), `left_area` pings and rejected photos must persist, exactly like the mock. So actions are Spacetime procedures that run one transaction and return an `ActionResult {ok, error, metaJson, dataJson}`, which the client turns into the mock's `Result<T>`. Reducers are used for the scheduler, bridge, demo flags, `logout` and `reset_demo`.
- **Passwords are MVP-grade.** The client sends `SHA-256("shamepool:v1:<kind>:<username>:<secret>")` (pure-JS implementation, same output as WebCrypto, works on plain-http LAN origins); the module only ever stores and compares that hash, and also hashes security answers. It is salted by username but not a slow KDF. Strength, confirm and `same_password` checks run on the client because the server never sees plaintext. Reset tokens use the module's deterministic RNG. A production system needs argon2 behind TLS or a real auth provider.
- **Card numbers never reach Spacetime.** The client validates the number and CVC, then sends only brand, last four and expiry.
- **Photos never reach Spacetime.** `finishCheckin` sends the photo size and a fingerprint; the check-in completes with `aiVerified=false`, `aiReason="AI check not connected"` (TODO hook for Gemini).
- **Identity per tab.** The Spacetime token is kept in `sessionStorage`, so each tab is its own identity and can be signed in as a different user (like the mock). Closing the tab means signing in again.
- **Ids** are strings (`u_x`, `seed_kevin`, `squad_mhacks`) like the mock; money is i32 cents; times are f64 epoch ms on the demo clock (`demo_flags.time_offset_ms`).
- **Squad scoping** is client-side `WHERE squad_id = X` on public tables (any client can subscribe to other squads; invite codes are therefore not secret). Acceptable for the MVP.
- Schema changes that add schedules or break tables need `spacetime publish --delete-data=always`; the module re-seeds in `init`.

## Commands

```
# publish (from the repo root; CLI path on this machine: C:\Users\KEVIN\AppData\Local\SpacetimeDB\spacetime.exe)
spacetime publish shamepool-mvp --module-path spacetimedb --yes
spacetime generate --lang typescript --out-dir web/src/data/live/bindings --module-path spacetimedb --yes
node scripts/sync-shared.mjs            # after editing web/src/data/{logic,authLogic,billingLogic,types}.ts or live/{mappers,sha256}.ts

# bridge identity (once per database; writes STDB_BRIDGE_TOKEN, BRIDGE_TICK_SECRET to web/.env.local)
cd web && npx tsx ../scripts/bridge-token.ts

# inspect
spacetime sql shamepool-mvp "SELECT id,kind,status FROM outbox"
spacetime logs shamepool-mvp -n 50
spacetime call shamepool-mvp reset_demo
```

Dashboard: https://spacetimedb.com/shamepool-mvp
