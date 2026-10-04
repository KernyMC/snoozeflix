# Contracts: the only API the UI is allowed to use

All UI code imports from `@/data` only. `@/data` exports the hooks and actions below and picks the implementation from `NEXT_PUBLIC_DATA_MODE` (`mock` | `live`).

## Types (`src/data/types.ts`)
```ts
export type Cents = number; // integer, always

export interface User { id: string; name: string; avatar: string; squadId: string | null; balanceCents: Cents; }

export interface Squad {
  id: string; name: string; inviteCode: string;
  poolGoalName: string; poolGoalCents: Cents; poolBalanceCents: Cents;
  timezone: string; relayLinked: boolean;
}

export interface Goal {
  id: string; userId: string; squadId: string;
  title: string; emoji: string; lat: number; lng: number; radiusM: number;
  daysOfWeek: number[];          // 0 = Sun
  deadlineMinutes: number;       // minutes after local midnight
  minStayMinutes: number;
  basePenaltyCents: Cents; maxPenaltyCents: Cents;
  consecutiveFlakes: number; streak: number; active: boolean;
  createdAt: number; lastEvaluatedDate: string; // YYYY-MM-DD, last date flake-evaluated
}

export type CheckinStatus = 'in_progress' | 'completed' | 'failed';
export interface Checkin {
  id: string; goalId: string; userId: string; localDate: string;
  status: CheckinStatus; startedAt: number; lastDistanceM: number; lastPingAt: number;
  attempts: number;                // photo attempts, max 3
  aiVerified?: boolean; aiReason?: string; aiRoast?: string | null;
}

export type PenaltyStatus = 'pending' | 'charged' | 'failed';
export interface Penalty {
  id: string; goalId: string; userId: string; squadId: string;
  localDate: string; amountCents: Cents;      // actually charged
  intendedCents: Cents; shortfallCents: Cents; // intended - charged
  status: PenaltyStatus; createdAt: number;
}

export type FeedKind = 'commit' | 'checkin' | 'flake' | 'milestone' | 'bot' | 'message' | 'cashout';
export interface FeedEvent { id: string; squadId: string; actorUserId: string | null; kind: FeedKind; text: string; createdAt: number; meta?: Record<string, unknown>; }

export interface LeaderboardRow { user: User; rank: number; completionRate: number | null; streak: number; totalPaidCents: Cents; isFlakeOfWeek: boolean; }

export interface CashoutProposal {
  id: string; squadId: string; proposerUserId: string; merchantName: string;
  amountCents: Cents; status: 'open' | 'approved' | 'rejected' | 'paid' | 'cancelled';
  votes: Record<string, boolean>; createdAt: number;
}

export interface PhotoVerdict { verified: boolean; confidence: number; reason: string; roast: string | null; }

export interface BotReply {
  text: string;
  pendingAction?: { id: string; label: string; kind: 'update_goal_penalty'; args: Record<string, unknown>; expiresAt: number };
}

export type ErrorCode =
  | 'invalid_name' | 'invalid_code' | 'already_in_squad' | 'squad_full' | 'invalid_amount' | 'not_in_squad' | 'no_user'
  | 'invalid_title' | 'no_days' | 'invalid_radius' | 'invalid_penalty' | 'invalid_location' | 'invalid_stay' | 'too_many_goals' | 'goal_not_found' | 'not_your_goal'
  | 'too_far' | 'left_area' | 'too_early' | 'not_due_today' | 'deadline_passed' | 'already_done' | 'already_flaked' | 'invalid_photo' | 'photo_rejected' | 'too_many_attempts' | 'checkin_not_found'
  | 'invalid_message' | 'rate_limited' | 'action_expired' | 'action_not_found'
  | 'pool_not_ready' | 'proposal_open' | 'proposal_not_found' | 'pool_changed'
  | 'offline' | 'mock_error' | 'unknown';

export type Result<T> = { ok: true; data: T } | { ok: false; error: ErrorCode; meta?: Record<string, unknown> };
```

## Hooks (live-updating)
```ts
useConnection(): { status: 'connecting' | 'ready' | 'error'; mode: 'mock' | 'live' }
useMe(): User | null
useSquad(): Squad | null
useSquadMembers(): User[]
useMyGoals(): Goal[]
useGoal(goalId): Goal | null
useGoalHistory(goalId): { checkins: Checkin[]; penalties: Penalty[] }
useActiveCheckin(goalId): Checkin | null
useLeaderboard(): LeaderboardRow[]
useFeed(limit = 50): FeedEvent[]
usePoolFunders(): { user: User; totalCents: Cents }[]
useOpenCashout(): CashoutProposal | null
useBotThread(): { id: string; from: 'me' | 'bot'; text: string; pendingAction?: BotReply['pendingAction'] }[]
```
Hooks return `undefined`-safe values; `useMe() === undefined` means loading, `null` means no identity (components distinguish via `useConnection().status`).

## Actions (async, return `Result<T>`)
```ts
registerUser({ name, avatar }): Result<User>
claimSeedUser(userId): Result<User>                 // demo
listSeedUsers(): Result<User[]>                     // demo
createSquad({ name, poolGoalName, poolGoalCents }): Result<Squad>
joinSquad(inviteCode): Result<Squad>
createGoal(input: Omit<Goal,'id'|'userId'|'squadId'|'consecutiveFlakes'|'streak'|'active'|'createdAt'|'lastEvaluatedDate'>): Result<Goal>
updateGoalPenalty(goalId, baseCents): Result<Goal>
startCheckin(goalId, pos:{lat,lng,accuracyM?}): Result<Checkin>   // too_far (meta.distanceM) | not_due_today | deadline_passed | already_done | already_flaked
pingCheckin(checkinId, pos): Result<Checkin>                      // left_area
finishCheckin(checkinId, photoJpegBase64): Result<{checkin; verdict}> // too_early (meta.secondsLeft) | photo_rejected (meta.verdict) | too_many_attempts
forceFlake(goalId): Result<Penalty>                               // demo; idempotent
postMessage(text): Result<FeedEvent>
askBot(text): Result<BotReply>
confirmBotAction(actionId): Result<BotReply>
proposeCashout(merchantName): Result<CashoutProposal>
voteCashout(proposalId, approve): Result<CashoutProposal>
cancelCashout(proposalId): Result<CashoutProposal>
setPoolGoal(name, cents): Result<Squad>
// auth (mock-grade; see withdrawals.md)
signUp({ name, email, password, avatar }): Result<User>   // invalid_email | weak_password | email_taken | invalid_name
signIn({ email, password }): Result<User>                 // no_account | invalid_email | weak_password
signOut(): Result<true>
// account management (signed-in user; email, password and security changes re-check the current password)
useAccount(): AccountInfo | null    // { username, email, firstName, lastName, securityQuestionIds }; null = profile has no login. Never carries hashes.
updateAvatar(avatar): Result<User>                                     // invalid_avatar
updateAccountName({ firstName, lastName }): Result<AccountInfo>        // invalid_first_name | invalid_last_name
changeEmail(newEmail, currentPassword): Result<AccountInfo>            // invalid_email | same_email | wrong_password | email_taken | auth_locked
changePassword(current, next, confirm): Result<true>                   // weak_password | password_mismatch | same_password | wrong_password | auth_locked
updateSecurity(currentPassword, [{ qId, answer }] x3): Result<AccountInfo> // invalid_security | wrong_password | auth_locked
// all five: no_user (signed out) | no_account (profile without a login). 5 wrong current passwords lock confirmation for 30 s.
// wallet
useWallet(): Wallet | null          // balance, stake (locked), available, pending, stake breakdown
useWithdrawals(): Withdrawal[]
requestWithdrawal(amountCents): Result<Withdrawal>   // below_minimum | insufficient_available | withdrawal_pending | invalid_amount
cancelWithdrawal(id): Result<Withdrawal>             // withdrawal_not_found
// demo
resetDemoData(): Result<true>
setDemoFlags({ nextPhotoFails?, fakeLocation?: {lat,lng}|null, timeOffsetMs? }): Result<true>
getDemoFlags(): DemoFlags
```

## Shared pure logic (`src/data/logic.ts`)
`haversineM`, `isInside(goal,pos)`, `nextPenaltyCents(goal)` (n capped at 10), `applyPenalty(balance, intended)` → `{charged, shortfall}`, `localDate(ts,tz)`, `localMinutes(ts,tz)`, `isDueToday`, `deadlinePassed`, `missedDates(goal, now, tz)` (≤7), `completionRateThisWeek`, `buildLeaderboard`, `penaltyKey`, `validateGoalInput`, `normalizeInviteCode`, `generateInviteCode`, `formatDistance`, `formatCents`. Unit-tested; ported 1:1 into the SpacetimeDB module in Phase B.

## Mock behavior rules
- Store `shamepool-mock-v1` (Zustand persist) + `BroadcastChannel('shamepool')` with `storage`-event fallback.
- Tab identity: `sessionStorage.mockUserId`.
- Latency 300–800 ms; `?mockSlow=1` → 3 s; `?mockError=1` → actions fail `mock_error`.
- Seed: squad "MHacks Crew" (invite `PIZZA6`), pool $35/$60 "Pizza night", users Kevin 💻, Ana 🏋️, Leo 🎧, Maya 📚, 1–2 goals each at Ann Arbor coordinates, a week of check-ins, 2 charged penalties.
- `finishCheckin`: DemoFlags.nextPhotoFails → reject with roast; else accept.
- Bot: keyword router + canned roasts/hype + pendingAction (5 min TTL).
- Scheduler: `setInterval` 15 s in leader tab; catches up missed dates (≤7); idempotent via `penaltyKey`.
- Invariants enforced by tests: balances ≥ 0, `pool == charged penalties − paid cashouts + seeds`, one penalty per `penaltyKey`.
