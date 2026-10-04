
## Nessie integration (nessie-integrator, 2026-10-04)
- **Real sandbox beats the charter.** `api.nessieisreal.com` is a pure ledger: transfers/purchases/withdrawals/deposits never change account balances (any status), so the pool balance is owned by Spacetime and `nessie_transfer` omits `poolBalanceCents`. Evidence: docs/nessie-probe-output.json.
- **Transfers have no payee field** (`payee_id`/`medium` are rejected). We record the pool account id in the description and mirror a deposit on the pool account as the payee-side ledger entry.
- **Whole dollars on the wire**: balances/amounts are integers server-side (decimals truncated). Cents -> dollars rounded half up, minimum $1 for positive amounts; zero/negative rejected locally (sandbox accepts them, and also has no overdraft check).
- **Idempotency** via `[ik:<ik>]` in descriptions; customers carry it in `address.street_name`, accounts are found by nickname (`FT-user-*`, `FT-pool-*`), merchants by name. POSTs are never blindly retried; after a retryable failure the ledger is re-checked.
- **Mock = fake fetch** running the real client code, reproducing sandbox quirks; `NESSIE_MOCK_BALANCES=true` for a bank-like mode.
- **Wrong API keys return 200 with empty data** (no auth error), so a 200 does not prove the key is valid.
- Scripts live in `scripts/` at the project root (run from `web/` with `npx tsx ../scripts/<name>.ts`). Customers and merchants cannot be deleted in the sandbox; reset removes `FT-*` accounts only.
