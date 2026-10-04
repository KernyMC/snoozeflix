# Withdrawals, Wallet and Auth UI

## Principle
Your personal balance is yours and can be withdrawn. The pool belongs to the squad and is **never paid out as cash to individuals** (not gambling: nobody profits from a friend's flake). Pool money leaves only through a cash-out vote.

## Rules (all pure functions in `logic.ts`, easy to change)
1. `available = max(0, balance − stake)`.
2. `stake` = worst-case penalties for the **next 3 days (rolling)** across active goals: for each goal, sum of `nextPenaltyCents` with escalation for every occurrence still ahead. Today counts only if not done/flaked and the deadline has not passed. Rolling window (not calendar week) so nobody can empty the wallet on Sunday night and flake free on Monday.
3. Request → money moves to **escrow** (`pending`) and lands after a **cooling period**: 24 h in real mode, 20 s when `NEXT_PUBLIC_DEMO=true`. While pending it can be cancelled and the money returns to the balance.
4. Minimum `$5`. One pending withdrawal at a time. Integer cents only.
5. Withdrawal and completion are posted to the squad feed ("Kevin is withdrawing $50"): visibility is part of the pain.
6. Penalties already paid are never refunded. The pool is never paid out in cash.
7. Destination in MVP: the user's linked Capital One Nessie sandbox account (mock: "Capital One ••••4821").

## Edge cases
| # | Case | Expected |
|---|---|---|
| W1 | Amount not integer / ≤ 0 / NaN | `invalid_amount` |
| W2 | Amount < $5 | `below_minimum` |
| W3 | Amount > available | `insufficient_available`, `meta.availableCents`, `meta.stakeCents` |
| W4 | Second request while one is pending | `withdrawal_pending` |
| W5 | Cancel pending | funds return to balance; status `cancelled`; idempotent second call → `withdrawal_not_found` |
| W6 | Deadline passes during cooling period | penalty charged from balance (stake was kept, so it is covered) |
| W7 | Cancel someone else's withdrawal | `withdrawal_not_found` |
| W8 | Tab closed while pending | scheduler completes it when `availableAt` passes (also on next load) |
| W9 | User without squad | `not_in_squad` |
| W10 | Stake > balance | available 0, UI explains "Everything is at stake" |
| W11 | Goal created while withdrawal pending | stake rises; does not affect escrowed money |
| W12 | Balance 0 | Withdraw disabled with explanation |
| W13 | Double click on confirm | button disabled while pending; second request hits W4 |

## Auth UI (no real credentials yet)
- Routes `/register` and `/login`. Mock only: sign-up stores name, email, avatar (password is validated and **discarded**). Sign-in finds the account by email; any password of ≥ 8 chars is accepted in mock.
- Live (later): real provider (e.g. email magic link / OAuth) behind the same `signUp` / `signIn` / `signOut` actions.
- Validation: `invalid_email`, `weak_password` (< 8 chars), `email_taken`, `no_account`, `invalid_name`.
- Flow: Welcome → Register → Onboarding (squad) → Home. Returning: Welcome → Login → Home (or Onboarding if no squad).
- `/onboarding` without identity redirects to `/register` (keeps `?join=`).
- Settings has Sign out.
