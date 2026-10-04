export type Cents = number; // integer, always

export interface User { id: string; name: string; avatar: string; squadId: string | null; balanceCents: Cents; }

export interface Squad {
  id: string; name: string; inviteCode: string;
  poolGoalName: string; poolGoalCents: Cents; poolBalanceCents: Cents;
  timezone: string; relayLinked: boolean;
}

export interface Goal {
  id: string; userId: string; squadId: string;
  /** `emoji` holds an icon key such as 'goal-gym' (see components/ui/Icon.tsx); older data may hold a literal emoji. */
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

export type FeedKind = 'commit' | 'checkin' | 'flake' | 'milestone' | 'bot' | 'message' | 'cashout';
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
  | 'invalid_first_name' | 'invalid_last_name' | 'invalid_email' | 'invalid_username' | 'weak_password' | 'password_mismatch'
  | 'username_taken' | 'email_taken' | 'invalid_security' | 'invalid_credentials' | 'account_not_found' | 'wrong_answers'
  | 'auth_locked' | 'invalid_reset'
  | 'offline' | 'mock_error' | 'unknown';

export interface SecurityAnswer { qId: string; answerHash: number }
export interface Account {
  userId: string; username: string; email: string; firstName: string; lastName: string;
  passwordHash: number; // mock-only hash; the real backend must use a proper KDF
  security: SecurityAnswer[];
}
export interface RegisterInput {
  firstName: string; lastName: string; email: string; username: string; password: string; confirm: string;
  security: { qId: string; answer: string }[];
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: ErrorCode; meta?: Record<string, unknown> };

export type GoalInput = Omit<Goal, 'id' | 'userId' | 'squadId' | 'consecutiveFlakes' | 'streak' | 'active' | 'createdAt' | 'lastEvaluatedDate'>;
export interface Pos { lat: number; lng: number; accuracyM?: number }
export interface DemoFlags { nextPhotoFails: boolean; fakeLocation: Pos | null; timeOffsetMs: number }
