# Nessie contract (verified against the real sandbox, 2026-10-04)

Evidence: `docs/nessie-probe-output.json` (key redacted), produced by `scripts/nessie-probe.ts`. The sandbox at `https://api.nessieisreal.com` is **not** the classic Nessie: it is a thin pydantic/FastAPI ledger. Where it differs from the charter, the sandbox wins.

## Auth
- `?key=<NESSIE_API_KEY>` query param on every call, JSON bodies.
- **A wrong or empty key is not rejected**: `GET /customers?key=bad` answers `200 []` (you silently become an empty tenant). Do not use a 200 as proof the key is right. Unknown routes answer `403 {"message":"Missing Authentication Token"}` (an API-gateway message, not an auth failure).
- No rate limiting seen (15 sequential GETs in 1.6 s, all 200). Latency ~100-150 ms per call.

## Endpoints used (all verified)
| Purpose | Call | Body | Notes |
|---|---|---|---|
| create customer | `POST /customers` | `first_name,last_name,address{street_number,street_name,city,state,zip}` | 201 `{code,message,objectCreated{_id,...}}`. No length limits found. **Cannot be deleted** (403). |
| list customers | `GET /customers` | | only the key's own customers |
| create account | `POST /customers/{id}/accounts` | `type:"Checking", nickname, rewards:0, balance` | `balance` is an **integer**; 12.34 is stored as 12 |
| get / list / delete account | `GET /accounts/{id}`, `GET /customers/{id}/accounts`, `DELETE /accounts/{id}` | | DELETE works (200, empty body); afterwards GET is 404. `PUT /accounts/{id}` needs `nickname` and ignores `balance`. |
| create merchant | `POST /merchants` | `name,category,address,geocode` | 201; listable via `GET /merchants`; cannot be deleted (403) |
| transfer | `POST /accounts/{payer}/transfers` | **`transaction_date,status,amount,description` only** | `payee_id`, `medium`, anything else: 400 "extra fields not permitted". **There is no payee.** |
| purchase | `POST /accounts/{id}/purchases` | `merchant_id,medium:"balance",amount` (+`purchase_date,status,description`) | merchant id is not validated on create |
| withdrawal | `POST /accounts/{id}/withdrawals` | `medium,transaction_date,status,amount,description` | |
| deposit | `POST /accounts/{id}/deposits` | `medium,transaction_date,status,amount,description` | status/description required |
| lists | `GET /accounts/{id}/{transfers,purchases,withdrawals,deposits}` | | `type=payer/payee` is ignored; empty list is `404 "No transfers found for this account"` |

## Behavior that drives the design
1. **Balances never change.** Transfers, purchases, withdrawals and deposits (any status: pending, completed, cancelled, bogus) leave every account balance untouched, immediately and after 3 s. Sandbox = pure ledger. Therefore `nessie_transfer` omits `poolBalanceCents`; the pool balance lives in Spacetime.
2. **Statuses are free-form strings** (`pending`, `completed`, `cancelled`, `bogus` all accepted). We always send `completed`. `status` is *required* on transfer, deposit, withdrawal; purchases without `status` break the purchases list (400 "status field required") for that account, so we always send it.
3. **Amounts are truncated to integers** by the server (1.5 -> 1). Zero, negative and overdraft amounts are accepted (no balance check). We enforce positivity ourselves.
4. **Transfers have no payee**, and the list shows only `id,transaction_date,status,amount,description`. We record the payee account id in the description and mirror a **deposit on the pool account** (`ik` = `<ik>:in`) as the payee-side ledger entry.
5. **List item shape differs by resource**: transfers use `id`, others use `_id`.
6. Poisoned list: a purchase with a merchant id shorter than 24 chars makes `GET .../purchases` return 400 for that account until the account is deleted. We always use real merchant ids.
7. Error format: validation errors are a bare JSON string `"2 validation errors for X\nfield\n  msg (type=...)"` (400); 404 often has an empty body; gateway errors are `{"message":...}`.

## Policies
- **Cents in/out, whole dollars on the wire** via `centsToNessieAmount`: round half up, minimum $1 for any positive amount, zero/negative/non-integer rejected (`NessieError 400 bad_amount`). `nessieAmountToCents` multiplies by 100. Example: 250 cents -> $3, 40 cents -> $1, 1500 -> $15.
- **Idempotency**: description ends with `[ik:<ik>]`. Before each create we list the relevant ledger on the payer/owning account and reuse an entry carrying the token. After a retryable POST failure (timeout, network, 5xx) we re-check before re-posting. Customers/accounts/merchants (no description field): customer `address.street_name = "ShamePool ik:<ik>"`, accounts found by nickname (`FT-user-<userId>`, `FT-pool-<squadId>`), merchants by exact name. Concurrency caveat: two simultaneous identical jobs could both pass the check; the outbox runs jobs serially.
- **Client**: 8 s timeout, one retry after 500 ms for GET/DELETE on network error/5xx (POSTs are never blindly retried), key redacted from all errors, `NessieError{status,code,message,culprit,retryable}`.
- **Reset**: `scripts/nessie-reset.ts` deletes `FT-*` accounts only (customers/merchants are undeletable). Re-seeding reuses the existing customers.

## Job handlers (`handleNessieJob`)
| kind | payload | result | Nessie writes |
|---|---|---|---|
| `nessie_create_user` | `{ik,userId,name,startingBalanceCents?}` | `{customerId,accountId}` | customer (marker in street_name) + Checking account `FT-user-<userId>`, starting balance default 20000 cents ($200) |
| `nessie_create_pool` | `{ik,squadId,squadName}` | `{customerId,accountId}` | customer "ShamePool <squadName>" + account `FT-pool-<squadId>` balance 0 |
| `nessie_transfer` | `{ik,penaltyId,fromAccountId,toAccountId,amountCents}` | `{transferId}` | transfer on payer + deposit on pool |
| `nessie_withdraw` | `{ik,withdrawalId,accountId,amountCents}` | `{withdrawalId}` (Nessie id) | withdrawal on the account |
| `nessie_purchase` | `{ik,cashoutId,poolAccountId,merchantName,amountCents}` | `{merchantId,purchaseId}` | find-or-create merchant, purchase on pool |

Payload errors throw `NessieError` with `retryable:false` (`bad_payload`, `unknown_kind`). Network/timeout/5xx/429 errors have `retryable:true`.

## Mock twin
`NESSIE_MODE=mock` runs the same client code against an in-memory fake `fetch` that reproduces the quirks above (static balances, `id` vs `_id`, bare-string errors, 404 on empty lists, wrong key = empty tenant). `NESSIE_MOCK_BALANCES=true` switches it to a bank-like mode (balances move, overdraft -> 400).

## Unverified
Rate limits under heavy load, behavior of very large amounts, long-term data retention of the sandbox, and how the enterprise (`/enterprise/*`) endpoints behave (never used).
