# Charity: where a full pool goes if nobody spends it

## Rule
1. The pool is spent only by squad vote (cash-out). It is never paid out as cash to members and never refunded to flakers (not gambling).
2. The first time `poolBalance >= poolGoal`, the **cash-out clock** starts (`squad.poolFullAt`). The squad has **7 days** (3 minutes when `NEXT_PUBLIC_DEMO=true`) to spend it.
3. If the clock runs out with **no vote in progress**, `poolGoalCents` is **donated automatically** to the squad's charity. The clock waits while any proposal is open and resumes if it is rejected or cancelled.
4. Overflow stays in the pool; if it is still >= goal after a donation or cash-out, a new clock starts right away.
5. The squad can also **donate on purpose**: a "donate" proposal uses the same vote as a cash-out (strict majority).
6. Every squad has a charity (default `food-bank`). Any member can change it, except while a donation vote is open.
7. Donations are simulated in the demo (no real money moves).

## Edge cases
| # | Case | Expected |
|---|---|---|
| H1 | Pool below goal | no clock (`poolFullAt = null`) |
| H2 | Goal raised above the pool | clock stops |
| H3 | Open proposal at the deadline | no auto-donation until it closes |
| H4 | Proposal cancelled/rejected after the deadline | donated on the next scheduler tick |
| H5 | Settle called twice | one donation (idempotent: the clock resets) |
| H6 | Pool far above the goal | donate the goal amount, start a new clock if still full |
| H7 | Invalid charity id | `invalid_charity` |
| H8 | Change charity during a donation vote | `charity_locked` |
| H9 | Propose a donation with pool below goal | `pool_not_ready` |
| H10 | Money conservation | users + pool + donations stay constant |
| H11 | Tab closed at the deadline | the leader tab's scheduler settles it on its next tick (catch-up) |

## Not built yet
- Live mode (Spacetime module needs `charity_id`, `pool_full_at`, a `donation` table and procedures `set_charity`, `propose_donation`, `settle_charity` in the scheduled reducer).
- Dissolving a squad by vote (pool then goes to charity or a group purchase).
