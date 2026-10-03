# Data Model (Phase B — SpacetimeDB module)

Tables mirror `types.ts`. All money = `u64`/`i64` cents.

| Table | Key | Notes |
|---|---|---|
| `user` | `identity` (pk), `id` unique | name, avatar, squad_id, balance_cents |
| `squad` | `id` | invite_code unique index, pool_goal_name/cents, pool_balance_cents, timezone, relay_linked |
| `goal` | `id` | index on user_id, squad_id; last_evaluated_date |
| `checkin` | `id` | unique (goal_id, local_date) |
| `penalty` | `id` | **unique `penalty_key` = goal_id + local_date** → idempotency |
| `feed_event` | `id` auto_inc | index squad_id; trimmed to 200 |
| `cashout` | `id` | votes in child table `cashout_vote(proposal_id, user_id, approve)` |
| `bot_action` | `id` | pending actions with `expires_at` |
| `outbox` | `id` auto_inc | `kind` (nessie_transfer, nessie_purchase, gemini_roast, relay_post), `payload`, `status`, `attempts`, `next_try_at` |
| `deadline_tick` | scheduled | `check_deadlines` every 60 s |

## Reducers
`register_user`, `create_squad`, `join_squad`, `create_goal`, `update_goal_penalty`, `start_checkin`, `ping_checkin`, `complete_checkin` (called by bridge after Gemini), `force_flake`, `check_deadlines` (scheduled), `post_message`, `propose_cashout`, `vote_cashout`, `cancel_cashout`, `set_pool_goal`, `confirm_bot_action`, `claim_bridge`, `outbox_ack`, `outbox_fail`, `reset_demo`.

## Rules
- Every reducer validates with the same functions as `logic.ts`; errors map 1:1 to `ErrorCode`.
- Reducers are deterministic (no wall-clock except `ctx.timestamp`).
- Outbox jobs are idempotent; Nessie transfer carries `penalty_key` as description to dedupe.
- Bridge identity is the only one allowed to call `complete_checkin`, `outbox_*`.
