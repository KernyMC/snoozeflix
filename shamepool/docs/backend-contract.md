# Backend integration contract (Spacetime <-> Nessie bridge)

Project root: `E:\USERS\KEVIN\MLHACKS\flaketax` (product renamed **ShamePool**; older docs/agents say "Flake Tax", `specs/001-flaketax`, `flaketax` keys: read them as ShamePool / `specs/001-shamepool` / `shamepool`).
Web app: `web/`. Spacetime module: `spacetimedb/` (new). Spacetime CLI (not on PATH in this shell): `C:\Users\KEVIN\AppData\Local\SpacetimeDB\spacetime.exe` (v2.10.2, already logged in).
Secrets: only in `web/.env.local` (gitignored). `NESSIE_API_KEY` is already there. Never print it, never commit it, never reference it from client code.

## MVP scope
Make the existing app work end to end with `NEXT_PUBLIC_DATA_MODE=live` with **zero UI changes**: Spacetime holds all state and rules, Nessie moves the money. No Gemini and no Relay for now (live `finishCheckin` accepts the photo and records `aiVerified=false`, `aiReason="AI check not connected"`; the verify step is a TODO hook). Anything outside the hooks/actions exported from `web/src/data/index.ts` is out of scope. The mock (`web/src/data/mock/*`) is the behavioral reference: same rules, same error codes, same `Result` shapes. `web/src/data/logic.ts`, `authLogic.ts` and `billingLogic.ts` are pure and must be reused or copied 1:1 into the module.

## Ownership
- **spacetime-engineer**: `spacetimedb/**`, `web/src/data/live/**`, `web/src/server/stdb-bridge.ts`, `web/src/app/api/bridge/**`, `scripts/bridge-*.ts`, README "Why Spacetime".
- **nessie-integrator**: `web/src/server/nessie/**`, `scripts/nessie-*.ts`, `docs/nessie-contract.md`.
- Do not edit the other agent's files. Shared files (`web/package.json`): `spacetimedb`, `zod`, `tsx` are already installed; do not run `npm install` for other packages without need and never run two installs at once.
- No git commands (the lead handles commits). No `rm -rf` chains. Do not start/stop anything on port 3100. If you need a dev server use another port (3101 spacetime, 3102 nessie) and stop it when done. Never run `next build` while a dev server uses the same `.next`.

## Outbox (the only way Spacetime talks to Nessie)
Table `outbox` (private): `id u64 autoInc`, `kind string`, `payload string` (JSON), `status 'pending'|'done'|'failed'`, `attempts u32`, `next_try_at timestamp`, `created_at timestamp`, `result string`.
Reducers run no network I/O. Each state change inserts its job in the same transaction. The Next.js route `/api/bridge/tick` (spacetime-engineer) reads pending jobs with the bridge identity, resolves missing foreign ids from the tables (re-queues with a delay if they are not ready), calls `handleNessieJob`, then calls a bridge reducer (`outbox_done(id, resultJson)` / `outbox_fail(id, error)`) that applies the result (store ids, mark penalty/withdrawal/cashout settled). Only the bridge identity may call bridge reducers.

Nessie side (nessie-integrator) exports from `web/src/server/nessie/handlers.ts`:
```ts
export interface OutboxJob { id: string; kind: string; payload: Record<string, unknown>; attempts: number }
export async function handleNessieJob(job: OutboxJob): Promise<Record<string, unknown>> // throws NessieError on failure; idempotent
```
Money in payloads is **integer cents**. Every payload has `ik` (idempotency key string) that the handler embeds in the Nessie `description`.

| kind | payload | result |
|---|---|---|
| `nessie_create_user` | `{ ik, userId, name }` | `{ customerId, accountId }` (account funded with the user's starting balance, default 20000 cents) |
| `nessie_create_pool` | `{ ik, squadId, squadName }` | `{ customerId, accountId }` |
| `nessie_transfer` | `{ ik, penaltyId, fromAccountId, toAccountId, amountCents }` | `{ transferId, poolBalanceCents }` (pool balance read back from Nessie when the sandbox reflects it; else omit) |
| `nessie_withdraw` | `{ ik, withdrawalId, accountId, amountCents }` | `{ withdrawalId }` (Nessie withdrawal from the user's account) |
| `nessie_purchase` | `{ ik, cashoutId, poolAccountId, merchantName, amountCents }` | `{ merchantId, purchaseId }` |

Policy: Spacetime is the source of truth the UI reads. A failed or slow Nessie job never blocks the app: the penalty/withdrawal/cash-out stays valid in Spacetime and is retried (max 5, backoff); the UI may show "pending". If Nessie rejects decimals the nessie agent converts cents to whole dollars at the boundary and documents the rounding.

## Env vars (web/.env.local)
```
NEXT_PUBLIC_DATA_MODE=mock|live
NEXT_PUBLIC_DEMO=true
NEXT_PUBLIC_STDB_URI=wss://maincloud.spacetimedb.com
NEXT_PUBLIC_STDB_DB=<db name chosen by spacetime-engineer>
STDB_BRIDGE_TOKEN=<printed by scripts/bridge-token.ts>
NESSIE_API_KEY=<already set>
NESSIE_MODE=live|mock          # mock = in-memory Nessie twin
BRIDGE_TICK_SECRET=<random>    # protects /api/bridge/tick
```

## Done = lead can run
`npm run dev`, set `NEXT_PUBLIC_DATA_MODE=live`, open two browsers, register/login, join a squad, create a goal, Flake now, see the pool/leaderboard/feed update in both within ~1 s, and a real Nessie transfer appear for the penalty.
