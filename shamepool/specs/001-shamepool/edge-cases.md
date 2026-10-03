# Edge Cases (must be handled in mock AND live)

Legend: **Where** = who enforces. `logic` = `src/data/logic.ts`, `action` = mock/live action, `UI` = screen.

## Identity & squad
| # | Case | Expected behavior | Where |
|---|---|---|---|
| E1 | Empty / whitespace name, name > 20 chars | Error `invalid_name`; UI trims, max 20 | action + UI |
| E2 | Invite code lowercase / with spaces | Normalize to uppercase, trim | action |
| E3 | Invalid invite code | `invalid_code`, shake input | action + UI |
| E4 | Join squad when already in one | `already_in_squad` | action |
| E5 | Squad full (>8 members) | `squad_full` | action |
| E6 | Pool goal amount ≤ 0 or > $1000 | `invalid_amount` | action + UI |
| E7 | User with no squad opens `/home` `/squad` `/bot` | Redirect to `/onboarding` | UI |
| E8 | No identity in tab (fresh sessionStorage) | Redirect to `/` | UI |
| E9 | Two tabs, same user | Allowed; state converges via sync | store |
| E10 | Squad with 1 member | Leaderboard shows 1 row, bot says "Invite friends" | UI |
| E11 | Invite code collision | Regenerate until unique | action |

## Goals
| # | Case | Expected | Where |
|---|---|---|---|
| G1 | Empty title or > 40 chars | `invalid_title` | action + UI |
| G2 | No days selected | `no_days` | action + UI |
| G3 | Radius < 50 m or > 1000 m | clamp / `invalid_radius` | action + UI |
| G4 | Base penalty < $1 or > cap | `invalid_penalty` | action + UI |
| G5 | Cap < base | Cap = max(base, cap) | logic |
| G6 | Deadline 23:59 / 00:00 | Valid; deadline is on the *local date* of the occurrence | logic |
| G7 | Lat/lng out of range or NaN | `invalid_location` | action |
| G8 | > 5 active goals per user | `too_many_goals` | action |
| G9 | Min stay > 180 min or < 1 | `invalid_stay` | action |
| G10 | Goal created after today's deadline | First due date = next scheduled day; no retroactive flake | logic |
| G11 | Goal created on a scheduled day before deadline | Due today | logic |
| G12 | Change penalty mid-streak | Applies to *future* penalties only; `consecutiveFlakes` untouched | action |
| G13 | Deleting/archiving goal | (Not in MVP) `active=false` stops flakes, history stays | action |

## Check-in
| # | Case | Expected | Where |
|---|---|---|---|
| C1 | Location permission denied | Screen "Allow location" + demo "Pretend I'm there" (if demo) | UI |
| C2 | Geolocation timeout / unavailable | Retry button, error `no_position` | UI |
| C3 | Accuracy > 100 m | Warn "weak GPS signal", still allow if within radius + accuracy | UI + logic |
| C4 | Outside radius | `too_far` with `meta.distanceM`; format "850 m" / "1.2 km" | action + UI |
| C5 | Check-in when goal not due today | `not_due_today` | action |
| C6 | Check-in after deadline passed | `deadline_passed` (flake already applied) | action |
| C7 | Already completed today | `already_done`; button shows "Done today" | action + UI |
| C8 | Already flaked today (penalty exists) | `already_flaked`; no check-in allowed | action |
| C9 | Existing in-progress check-in | Resume it (return same checkin) | action |
| C10 | Leaves area during stay | `left_area` → checkin `failed`, flakey worried, retry allowed if still before deadline | action |
| C11 | Finish before minStay | `too_early` + `meta.secondsLeft` | action |
| C12 | Stale in-progress (>3 h) | Auto-failed on next start | action |
| C13 | Camera permission denied / no camera | Fallback to file picker | UI |
| C14 | Photo > 1024 px or huge | Client resize to ≤1024 px JPEG q0.8 | UI |
| C15 | Non-image file chosen | `invalid_photo` | UI + action |
| C16 | AI rejects photo | checkin stays `in_progress`, roast shown, max 3 retries then `failed` | action |
| C17 | AI timeout / error (live) | Fail-open once: `verified=true, reason="AI unavailable"` flagged `aiVerified=false` | server |
| C18 | User closes tab mid-flow | Check-in resumes on return (C9) | store |
| C19 | Double tap on finish | Idempotent; second call returns same result | action |
| C20 | Check-in 10 s from deadline, finishing after | Evaluated by `startedAt` < deadline; allowed to finish up to 10 min grace only if started before deadline | action |
| C21 | Spoofed location (demo toggle on) | Allowed only when `NEXT_PUBLIC_DEMO=true` | UI |

## Penalties & money
| # | Case | Expected | Where |
|---|---|---|---|
| P1 | Flake twice same goal+date (tick + Flake now) | Single penalty (`penaltyKey`), second call returns existing | action |
| P2 | Balance < penalty | Charge `min(penalty, balance)`; record `amountCents` actually charged + `shortfallCents`; balance never < 0 | action |
| P3 | Balance 0 | Penalty recorded as $0 charged, shortfall logged, still counts as flake, still roasts ("Broke AND flaky") | action |
| P4 | Consecutive flakes cap | `min(base*2^n, cap)`; n capped at 10 to avoid overflow | logic |
| P5 | Flake after completed day | consecutiveFlakes resets to 0 on completion | action |
| P6 | Completion resets streak? | Completion: streak+1, consecutiveFlakes=0. Flake: streak=0, consecutiveFlakes+1 | action |
| P7 | Goal due on non-scheduled day | No flake | logic |
| P8 | App closed at deadline | Scheduler catches up on next run: iterate missed dates since `lastEvaluatedDate`, max 7 days back | scheduler |
| P9 | Multiple missed dates | One penalty per date, escalating in order | scheduler |
| P10 | Flake for inactive goal | Skipped | logic |
| P11 | Money as float | Rejected; all values `Number.isInteger` | logic |
| P12 | Penalty on user who left squad | Not applicable (no leave in MVP) | — |
| P13 | Pool balance consistency | `pool == sum(charged penalties) - sum(paid cashouts)` invariant, tested | tests |
| P14 | Live: Nessie transfer fails | Penalty `status=failed`, retried by outbox (max 5), UI shows "pending" chip | live |

## Time & timezone
| # | Case | Expected |
|---|---|---|
| T1 | Squad timezone ≠ device timezone | All dates use `squad.timezone` (default `America/Detroit`) |
| T2 | DST switch day | Deadline computed from local wall-clock minutes, not +24h |
| T3 | Midnight rollover while screen open | Hooks recompute `isDueToday` every 30 s |
| T4 | Clock skew between tabs | Store uses injected `now()`; demo fast-forward offsets it |
| T5 | Week boundary | Week = Monday–Sunday local; completion rate uses only scheduled days up to today |
| T6 | New goal with 0 scheduled days elapsed this week | Completion rate shown as "—", treated as 1.0 for ranking |

## Feed & Bot
| # | Case | Expected |
|---|---|---|
| F1 | Empty message / > 280 chars | `invalid_message` |
| F2 | Message spam (>5 in 10 s) | `rate_limited` |
| F3 | HTML / script in message | Rendered as text (React escapes); never `dangerouslySetInnerHTML` |
| F4 | Feed > 200 events | Keep newest 200 |
| F5 | `@squadbot` not first word | Still triggers |
| F6 | Bot doesn't understand | Fallback help with suggestion chips |
| F7 | Bot action for someone else's goal | Refuse: "You can only change your own goals" |
| F8 | Pending bot action expires | 5 min TTL → `action_expired` |
| F9 | Confirm action twice | Idempotent |
| F10 | Bot penalty change out of bounds | Refuse with reason |
| F11 | Milestone dedupe | Pool 50%/100% and streak 3/5/10 announced once |

## Cash-out
| # | Case | Expected |
|---|---|---|
| X1 | Propose with pool < goal | `pool_not_ready` |
| X2 | Second open proposal | `proposal_open` |
| X3 | Vote twice | Latest vote replaces previous |
| X4 | Vote tie / no majority | Needs strict majority of members; otherwise stays open; proposer can cancel |
| X5 | Member joins mid-vote | Majority recalculated on current member count |
| X6 | Pool drops below amount before approval (refund n/a) | Re-check at approval; else `pool_changed` |
| X7 | Approved | status `approved` → `paid`, pool decreases, feed `cashout`, prompt new goal |
| X8 | Merchant empty | Defaults to "Pizza House" |
| X9 | Non-member votes | `not_in_squad` |

## UI / platform
| # | Case | Expected |
|---|---|---|
| U1 | Offline | LIVE mode only: banner + actions fail `offline`. MOCK mode must keep working offline (stage fallback) |
| U2 | `?mockError=1` | Actions return `{ok:false,error:'mock_error'}`, error UI shown |
| U3 | `?mockSlow=1` | 3 s latency, buttons show spinners, double-submit blocked |
| U4 | Double-click any submit | Disabled while pending |
| U5 | localStorage unavailable / corrupt | Wrap in try/catch, reseed |
| U6 | Schema version bump | Key `shamepool-mock-v1`; mismatch → reseed |
| U7 | BroadcastChannel unsupported | Fallback to `storage` event |
| U8 | `prefers-reduced-motion` | No shake/confetti/bounce |
| U9 | Projector with 0 feed events | Empty state |
| U10 | Very long names/titles | Truncate with ellipsis, never break layout at 375 px |
| U11 | Leaflet SSR | Dynamic import `ssr:false` |
| U12 | HTTPS missing on phone | Geolocation fails → message "Open the https link" |
| U13 | Unknown route / unknown goal id | Friendly 404 with Flakey |
