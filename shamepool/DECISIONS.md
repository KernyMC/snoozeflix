
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
