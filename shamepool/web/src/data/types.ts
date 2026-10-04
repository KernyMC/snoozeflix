export type Cents = number; // integer, always

export interface User { id: string; name: string; avatar: string; squadId: string | null; balanceCents: Cents; }

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
  | 'invalid_first_name' | 'invalid_last_name' | 'invalid_email' | 'invalid_username' | 'weak_password' | 'password_mismatch'
  | 'username_taken' | 'email_taken' | 'invalid_security' | 'invalid_credentials' | 'account_not_found' | 'wrong_answers'
  | 'auth_locked' | 'invalid_reset'
  | 'no_account' | 'wrong_password' | 'same_email' | 'same_password' | 'invalid_avatar'
  | 'below_minimum' | 'insufficient_available' | 'withdrawal_pending' | 'withdrawal_not_found'
  | 'invalid_card_name' | 'invalid_card_number' | 'unsupported_card' | 'invalid_expiry' | 'card_expired' | 'invalid_cvc' | 'invalid_nickname'
  | 'duplicate_card' | 'too_many_payments' | 'payment_not_found' | 'payment_in_use' | 'payment_required' | 'invalid_tier' | 'same_tier'
  | 'invalid_label' | 'invalid_address_name' | 'invalid_street' | 'invalid_unit' | 'invalid_city' | 'invalid_state' | 'invalid_zip'
  | 'too_many_addresses' | 'address_not_found'
  | 'offline' | 'mock_error' | 'unknown';

export interface SecurityAnswer { qId: string; answerHash: number }
export interface Account {
  userId: string; username: string; email: string; firstName: string; lastName: string;
  passwordHash: number; // mock-only hash; the real backend must use a proper KDF
  security: SecurityAnswer[];
}
/** The signed-in user's own account details. Never carries the password or answer hashes. */
export interface AccountInfo { username: string; email: string; firstName: string; lastName: string; securityQuestionIds: string[] }
export interface RegisterInput {
  firstName: string; lastName: string; email: string; username: string; password: string; confirm: string;
  security: { qId: string; answer: string }[];
}

/* ---------- plan, payment methods and addresses ---------- */
export type PlanTier = 'free' | 'paid';
/** How a paid plan begins: billed monthly from today, or after a free trial. */
export type PlanStart = 'monthly' | 'trial';
export type CardBrand = 'visa' | 'mastercard' | 'amex' | 'discover';
export interface Address {
  id: string; label: string; fullName: string; line1: string; line2: string; city: string; state: string; zip: string; createdAt: number;
}
export type AddressInput = Omit<Address, 'id' | 'createdAt'>;
/** A saved card. Only the brand, last four digits and expiry are kept, never the full number or the security code. */
export interface PaymentMethod {
  id: string; nickname: string; nameOnCard: string; brand: CardBrand; last4: string;
  expMonth: number; expYear: number; // 1–12, four-digit year
  addressId: string | null; // billing address, one of the user's saved addresses
  createdAt: number;
}
/** What the card form submits. `cardNumber` and `cvc` are validated and then discarded. */
export interface PaymentMethodInput { nickname: string; nameOnCard: string; cardNumber: string; expiry: string; cvc: string; addressId: string | null }
export interface Billing {
  tier: PlanTier; payments: PaymentMethod[]; addresses: Address[];
  /** When a free trial ends and the first monthly charge is due. Null or absent when the plan did not start with a trial. */
  trialEndsAt?: number | null;
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: ErrorCode; meta?: Record<string, unknown> };

export type GoalInput = Omit<Goal, 'id' | 'userId' | 'squadId' | 'consecutiveFlakes' | 'streak' | 'active' | 'createdAt' | 'lastEvaluatedDate'>;
export interface Pos { lat: number; lng: number; accuracyM?: number }
export interface DemoFlags { nextPhotoFails: boolean; fakeLocation: Pos | null; timeOffsetMs: number }
