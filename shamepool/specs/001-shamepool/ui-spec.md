# UI Spec: ShamePool

## Design direction
**Use the `playful-gamified-ui` skill** (`.claude/skills/playful-gamified-ui/SKILL.md`). It is authoritative for tokens, theme (LIGHT), fonts (Nunito), buttons, cards, mascot (Flakey), motion and copy. The old dark theme is dropped. Routes, components and states below still apply.

## Routes & screens

| Route | Screen | Key content |
|---|---|---|
| `/` | Welcome | Wordmark, Flakey, tagline "Flake on your goals. Pay your friends.", buttons: Get started / I have an invite code. Demo: "Who are you?" seeded user picker |
| `/onboarding` | Profile + squad | Step 1 name + emoji. Step 2 create squad or join (code). Step 3 invite code card Copy/Share |
| `/home` | My goals | Greeting, balance, total paid (red), `GoalCard`s, empty state |
| `/goals/new` | Create goal | Title, `LocationPicker`, radius, day chips, deadline, min stay, penalty stepper, escalation preview |
| `/goals/[id]` | Goal detail | Header, countdown, history, big "Check in", demo "Flake now" |
| `/goals/[id]/checkin` | Check-in flow | Locating → inside/too far → stay timer → photo → verifying → success/rejected |
| `/squad` | Squad dashboard | `PoolCard`, `Leaderboard`, `Feed` + message box, cash-out banner |
| `/squad?tv=1` | Projector | 3 columns, no nav, QR to join |
| `/bot` | Squad Bot chat | Chat, suggestion chips, confirmation cards |
| `/settings` | Settings | Profile, demo controls, reset data |
| `*` | 404 | Flakey sleepy + "Nothing here" |

## Components
- `AppShell`, `ProjectorShell`, `Button`, `Card`, `Chip`, `ProgressBar`
- `Flakey` (mascot, 6 moods), `MoneyText`, `CountUp`, `Toast`, `Skeleton`, `EmptyState`, `ErrorState`, `OfflineBanner`
- `GoalCard`, `LocationPicker`, `DayChips`, `PenaltyStepper`, `EscalationPreview`
- `CheckinFlow`, `StayTimerRing`, `PhotoCapture`, `VerdictCard`, `ResultSheet`
- `PoolCard`, `Leaderboard`, `Feed`, `MessageBox`, `BotChat`, `ActionConfirmCard`
- `CashoutBanner`, `VoteCard`, `FlakeModal`, `Confetti`, `ShakeOnFlake`
- `DemoPanel` (only when `NEXT_PUBLIC_DEMO=true`)

## Required states for every data screen
Loading (skeletons), empty (Flakey sleepy + CTA), error (retry), live update (animated). Mock supports `?mockError=1`, `?mockSlow=1`.

## Accessibility
Tap targets ≥ 44 px; color never the only signal; `prefers-reduced-motion`; labels on all inputs; focus rings; `aria-live="polite"` on feed + toasts.

## Auth routes (see auth-plan.md)
| Route | Screen |
|---|---|
| `/` | Login (first screen). Demo seed-user picker only when `NEXT_PUBLIC_DEMO=true`. |
| `/register` | Name, email, username, password, 3 security Q&As, then `/onboarding` |
| `/forgot-password` | 3 steps: find account, verify answers, new password |

Signed-out visits to any app route (and `/onboarding`) redirect to `/`. Settings has "Sign out".
