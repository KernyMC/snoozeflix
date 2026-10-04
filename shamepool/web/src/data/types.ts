export type Cents = number; // integer, always

export interface User { id: string; name: string; avatar: string; squadId: string | null; balanceCents: Cents; email?: string; }

export type WithdrawalStatus = 'pending' | 'completed' | 'cancelled';
export interface Withdrawal {
  id: string; userId: string; squadId: string; amountCents: Cents; status: WithdrawalStatus;
  destination: string; createdAt: number; availableAt: number;
}
export interface StakeItem { goalId: string; title: string; emoji: string; occurrences: number; cents: Cents }
export interface Wallet {
  balanceCents: Cents; stakeCents: Cents; availableCents: Cents; pendingCents: Cents;
  stake: StakeItem[]; minWithdrawCents: Cents; cooldownMs: number;
}

export interface Squad {
  id: string; name: string; inviteCode: string;
  poolGoalName: string; poolGoalCents: Cents; poolBalanceCents: Cents;
  timezone: string; relayLinked: boolean;
}

export interface Goal {
  id: string; userId: string; squadId: string;
  title: string; emoji: string; lat: number; lng: number; radiusM: number;
  daysOfWeek: number[]; // 0 = Sun
  deadlineMinutes: number; // minutes after local midnight
  minStayMinutes: number;
  basePenaltyCents: Cents; maxPenaltyCents: Cents;
  consecutiveFlakes: number; streak: number; active: boolean;
  createdAt: number; lastEvaluatedDate: string; // YYYY-MM-DD
}

export type CheckinStatus = 'in_progress' | 'completed' | 'failed';
export interface Checkin {
  id: string; goalId: string; userId: string; localDate: string;
  status: CheckinStatus; startedAt: number; lastDistanceM: number; lastPingAt: number;
  attempts: number;
  aiVerified?: boolean; aiReason?: string; aiRoast?: string | null;
}

export type PenaltyStatus = 'pending' | 'charged' | 'failed';
export interface Penalty {
  id: string; goalId: string; userId: string; squadId: string;
  localDate: string; amountCents: Cents; intendedCents: Cents; shortfallCents: Cents;
  status: PenaltyStatus; createdAt: number;
}

export type FeedKind = 'commit' | 'checkin' | 'flake' | 'milestone' | 'bot' | 'message' | 'cashout' | 'withdrawal';
export interface FeedEvent {
  id: string; squadId: string; actorUserId: string | null; // null = Squad Bot
  kind: FeedKind; text: string; createdAt: number; meta?: Record<string, unknown>;
}

export interface LeaderboardRow {
  user: User; rank: number; completionRate: number | null; streak: number;
  totalPaidCents: Cents; isFlakeOfWeek: boolean;
}

export interface CashoutProposal {
  id: string; squadId: string; proposerUserId: string; merchantName: string;
  amountCents: Cents; status: 'open' | 'approved' | 'rejected' | 'paid' | 'cancelled';
  votes: Record<string, boolean>; createdAt: number;
}

export interface PhotoVerdict { verified: boolean; confidence: number; reason: string; roast: string | null; }

export interface PendingAction { id: string; label: string; kind: 'update_goal_penalty'; args: Record<string, unknown>; expiresAt: number; }
export interface BotReply { text: string; pendingAction?: PendingAction; }
export interface BotThreadMessage { id: string; from: 'me' | 'bot'; text: string; pendingAction?: PendingAction; createdAt: number; }

export type ErrorCode =
  | 'invalid_name' | 'invalid_code' | 'already_in_squad' | 'squad_full' | 'invalid_amount' | 'not_in_squad' | 'no_user'
  | 'invalid_title' | 'no_days' | 'invalid_radius' | 'invalid_penalty' | 'invalid_location' | 'invalid_stay' | 'too_many_goals' | 'goal_not_found' | 'not_your_goal'
  | 'too_far' | 'left_area' | 'too_early' | 'not_due_today' | 'deadline_passed' | 'already_done' | 'already_flaked' | 'invalid_photo' | 'photo_rejected' | 'too_many_attempts' | 'checkin_not_found'
  | 'invalid_message' | 'rate_limited' | 'action_expired' | 'action_not_found'
  | 'pool_not_ready' | 'proposal_open' | 'proposal_not_found' | 'pool_changed'
  | 'invalid_email' | 'weak_password' | 'email_taken' | 'no_account'
  | 'below_minimum' | 'insufficient_available' | 'withdrawal_pending' | 'withdrawal_not_found'
  | 'offline' | 'mock_error' | 'unknown';

export type Result<T> = { ok: true; data: T } | { ok: false; error: ErrorCode; meta?: Record<string, unknown> };

export type GoalInput = Omit<Goal, 'id' | 'userId' | 'squadId' | 'consecutiveFlakes' | 'streak' | 'active' | 'createdAt' | 'lastEvaluatedDate'>;
export interface Pos { lat: number; lng: number; accuracyM?: number }
export interface DemoFlags { nextPhotoFails: boolean; fakeLocation: Pos | null; timeOffsetMs: number }
