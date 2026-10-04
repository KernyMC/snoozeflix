
## Nessie integration (nessie-integrator, 2026-10-04)
- **Real sandbox beats the charter.** `api.nessieisreal.com` is a pure ledger: transfers/purchases/withdrawals/deposits never change account balances (any status), so the pool balance is owned by Spacetime and `nessie_transfer` omits `poolBalanceCents`. Evidence: docs/nessie-probe-output.json.
- **Transfers have no payee field** (`payee_id`/`medium` are rejected). We record the pool account id in the description and mirror a deposit on the pool account as the payee-side ledger entry.
- **Whole dollars on the wire**: balances/amounts are integers server-side (decimals truncated). Cents -> dollars rounded half up, minimum $1 for positive amounts; zero/negative rejected locally (sandbox accepts them, and also has no overdraft check).
- **Idempotency** via `[ik:<ik>]` in descriptions; customers carry it in `address.street_name`, accounts are found by nickname (`FT-user-*`, `FT-pool-*`), merchants by name. POSTs are never blindly retried; after a retryable failure the ledger is re-checked.
- **Mock = fake fetch** running the real client code, reproducing sandbox quirks; `NESSIE_MOCK_BALANCES=true` for a bank-like mode.
- **Wrong API keys return 200 with empty data** (no auth error), so a 200 does not prove the key is valid.
- Scripts live in `scripts/` at the project root (run from `web/` with `npx tsx ../scripts/<name>.ts`). Customers and merchants cannot be deleted in the sandbox; reset removes `FT-*` accounts only.

## Audit fixes (docs/audit-report.md)
- **Seed is demo-proof:** every seeded goal is due every day with a late deadline (`makeSeed(now, 'demo')`); the Mon-Fri schedule remains as the `'weekly'` profile for tests. Kevin has one goal so a second one shows the upgrade pop-up. The 50% pool milestone is pre-recorded.
- **Money rules:** today's exposure counts in the stake until it is handled (even after the deadline); `00:00` deadlines are stored as 23:59; the pool goal is locked while the cash-out clock runs; `forceFlake` only works on your own active goals.
- **Photo checks:** an invalid photo (400/413) is never accepted; an AI outage is accepted once per check-in (flagged), then `ai_unavailable` asks for a retry.
- **Paid routes:** only same-origin browsers or a caller with `AGENT_API_KEY` are allowed, per-IP key comes from the platform headers, lower hourly ceilings, and the guard runs before the key check.
- **Voice confirm** accepts only whole-utterance "yes/confirm/do it". Keyword bot uses the number after "to".
- **Not fixed (live mode only, tracked in the audit):** unauthenticated `reset_demo`/`set_demo_flags`, `claimSeedUser` without password, public balances, `claim_bridge` race.

## Live mode on (Spacetime, 2026-10-04)
- **Production runs `NEXT_PUBLIC_DATA_MODE=live`** against Maincloud database `shamepool-mvp` (`NEXT_PUBLIC_STDB_URI=wss://maincloud.spacetimedb.com`, `NEXT_PUBLIC_STDB_DB=shamepool-mvp`), so a squad created on one phone is the same squad on every other device. Mock stays the default for local dev.
- **Shared-database hardening (closes the live items above):** `reset_demo` is bridge-only; `set_demo_flags` lets a signed-in user toggle only "next photo fails" (clock offset and fake location need the bridge identity); `claim_seed_user` returns `not_available` (seed users sign in with `Password1`); `force_flake` only on your own active goal.
- **Demo tools in live:** "Pretend I'm there" is kept per tab in the client (never sent to Spacetime); "Skip to 1 min before deadline" and "Reset demo data" answer `not_available` with a toast, because the clock and the data are shared by every squad.
- **Identity token in localStorage** (was sessionStorage), so a guest who joined from a QR keeps their user after closing the tab. A new tab is the same user.
- **`useMe` waits for the squad subscription** before resolving, so screens never see a half-loaded squad (it made the flake modal fire again on reload).
- **Still mock-only in live:** charity rule (page says "not available"), AI context for Squad Bot (live answers with the keyword bot), AI photo verdict (live accepts the photo and records "AI check not connected"). The Nessie bridge needs `STDB_BRIDGE_TOKEN` (+ `NESSIE_API_KEY`) on Vercel; without it penalties still move inside Spacetime and the outbox simply waits.
