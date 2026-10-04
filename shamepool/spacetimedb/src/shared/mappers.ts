// GENERATED COPY of web/src/data/live/mappers.ts. Do not edit; run: node scripts/sync-shared.mjs
// Row -> UI type mappers. Structural row types, so the same file serves the module (action results) and the
// client (generated bindings). Copied into spacetimedb/src/shared by scripts/sync-shared.mjs. Edit it here only.
import type {
  Address, Billing, BotThreadMessage, CashoutProposal, Checkin, FeedEvent, Goal, Penalty, PaymentMethod, PendingAction, Squad, User, Withdrawal,
  AccountInfo, ErrorCode, Result, CardBrand,
} from './types';

export interface UserRow { id: string; name: string; avatar: string; squadId: string; balanceCents: number; isSeed: boolean }
export interface SquadRow { id: string; name: string; inviteCode: string; poolGoalName: string; poolGoalCents: number; poolBalanceCents: number; timezone: string; relayLinked: boolean }
export interface GoalRow {
  id: string; userId: string; squadId: string; title: string; emoji: string; lat: number; lng: number; radiusM: number; days: number[];
  deadlineMinutes: number; minStayMinutes: number; basePenaltyCents: number; maxPenaltyCents: number; consecutiveFlakes: number; streak: number;
  active: boolean; createdAt: number; lastEvaluatedDate: string;
}
export interface CheckinRow {
  id: string; goalId: string; userId: string; squadId: string; localDate: string; status: string; startedAt: number; lastDistanceM: number;
  lastPingAt: number; attempts: number; aiState: string; aiReason: string; aiRoast: string;
}
export interface PenaltyRow {
  id: string; key: string; goalId: string; userId: string; squadId: string; localDate: string; amountCents: number; intendedCents: number;
  shortfallCents: number; status: string; createdAt: number; nessieTransferId: string;
}
export interface FeedRow { id: string; seq: number; squadId: string; actorUserId: string; kind: string; text: string; createdAt: number; metaJson: string }
export interface CashoutRow { id: string; squadId: string; proposerUserId: string; merchantName: string; amountCents: number; status: string; createdAt: number; nessiePurchaseId: string }
export interface VoteRow { id: string; proposalId: string; squadId: string; userId: string; approve: boolean }
export interface WithdrawalRow {
  id: string; userId: string; squadId: string; amountCents: number; status: string; destination: string; createdAt: number; availableAt: number; nessieWithdrawalId: string;
}
export interface AddressRow { id: string; userId: string; label: string; fullName: string; line1: string; line2: string; city: string; state: string; zip: string; createdAt: number }
export interface PaymentRow {
  id: string; userId: string; nickname: string; nameOnCard: string; brand: string; last4: string; expMonth: number; expYear: number; addressId: string; createdAt: number;
}
export interface PlanRow { userId: string; tier: string; trialEndsAt: number }
export interface BotRow { id: string; userId: string; fromBot: boolean; text: string; actionJson: string; createdAt: number }
export interface AccountView { userId: string; username: string; email: string; firstName: string; lastName: string; securityQuestionIds: string[] }

export const userOf = (r: UserRow): User => ({ id: r.id, name: r.name, avatar: r.avatar, squadId: r.squadId || null, balanceCents: r.balanceCents });
export const squadOf = (r: SquadRow): Squad => ({
  id: r.id, name: r.name, inviteCode: r.inviteCode, poolGoalName: r.poolGoalName, poolGoalCents: r.poolGoalCents,
  poolBalanceCents: r.poolBalanceCents, timezone: r.timezone, relayLinked: r.relayLinked,
});
export const goalOf = (r: GoalRow): Goal => ({
  id: r.id, userId: r.userId, squadId: r.squadId, title: r.title, emoji: r.emoji, lat: r.lat, lng: r.lng, radiusM: r.radiusM,
  daysOfWeek: Array.from(r.days), deadlineMinutes: r.deadlineMinutes, minStayMinutes: r.minStayMinutes, basePenaltyCents: r.basePenaltyCents,
  maxPenaltyCents: r.maxPenaltyCents, consecutiveFlakes: r.consecutiveFlakes, streak: r.streak, active: r.active, createdAt: r.createdAt,
  lastEvaluatedDate: r.lastEvaluatedDate,
});
export const checkinOf = (r: CheckinRow): Checkin => {
  const c: Checkin = {
    id: r.id, goalId: r.goalId, userId: r.userId, localDate: r.localDate, status: r.status as Checkin['status'], startedAt: r.startedAt,
    lastDistanceM: r.lastDistanceM, lastPingAt: r.lastPingAt, attempts: r.attempts,
  };
  if (r.aiState) { c.aiVerified = r.aiState === 'yes'; c.aiReason = r.aiReason; c.aiRoast = r.aiRoast || null; }
  return c;
};
export const penaltyOf = (r: PenaltyRow): Penalty => ({
  id: r.id, goalId: r.goalId, userId: r.userId, squadId: r.squadId, localDate: r.localDate, amountCents: r.amountCents,
  intendedCents: r.intendedCents, shortfallCents: r.shortfallCents, status: r.status as Penalty['status'], createdAt: r.createdAt,
});
export const feedOf = (r: FeedRow): FeedEvent => {
  const ev: FeedEvent = { id: r.id, squadId: r.squadId, actorUserId: r.actorUserId || null, kind: r.kind as FeedEvent['kind'], text: r.text, createdAt: r.createdAt };
  if (r.metaJson) { try { ev.meta = JSON.parse(r.metaJson) as Record<string, unknown>; } catch { /* ignore */ } }
  return ev;
};
export const cashoutOf = (r: CashoutRow, votes: VoteRow[]): CashoutProposal => ({
  id: r.id, squadId: r.squadId, proposerUserId: r.proposerUserId, merchantName: r.merchantName, amountCents: r.amountCents,
  status: r.status as CashoutProposal['status'], createdAt: r.createdAt,
  votes: Object.fromEntries(votes.filter((v) => v.proposalId === r.id).map((v) => [v.userId, v.approve])),
});
export const withdrawalOf = (r: WithdrawalRow): Withdrawal => ({
  id: r.id, userId: r.userId, squadId: r.squadId, amountCents: r.amountCents, status: r.status as Withdrawal['status'],
  destination: r.destination, createdAt: r.createdAt, availableAt: r.availableAt,
});
export const addressOf = (r: AddressRow): Address => ({
  id: r.id, label: r.label, fullName: r.fullName, line1: r.line1, line2: r.line2, city: r.city, state: r.state, zip: r.zip, createdAt: r.createdAt,
});
export const paymentOf = (r: PaymentRow): PaymentMethod => ({
  id: r.id, nickname: r.nickname, nameOnCard: r.nameOnCard, brand: r.brand as CardBrand, last4: r.last4, expMonth: r.expMonth, expYear: r.expYear,
  addressId: r.addressId || null, createdAt: r.createdAt,
});
export const billingOf = (plan: PlanRow | undefined, payments: PaymentRow[], addresses: AddressRow[]): Billing => ({
  tier: (plan?.tier as Billing['tier']) ?? 'free',
  payments: payments.map(paymentOf).sort((a, b) => a.createdAt - b.createdAt),
  addresses: addresses.map(addressOf).sort((a, b) => a.createdAt - b.createdAt),
  trialEndsAt: plan && plan.trialEndsAt >= 0 ? plan.trialEndsAt : null,
});
export const accountInfoOf = (r: AccountView): AccountInfo => ({
  username: r.username, email: r.email, firstName: r.firstName, lastName: r.lastName, securityQuestionIds: Array.from(r.securityQuestionIds),
});
export const botMessageOf = (r: BotRow): BotThreadMessage => {
  let pendingAction: PendingAction | undefined;
  if (r.actionJson) { try { pendingAction = JSON.parse(r.actionJson) as PendingAction; } catch { /* ignore */ } }
  return { id: r.id, from: r.fromBot ? 'bot' : 'me', text: r.text, pendingAction, createdAt: r.createdAt };
};

/* ---------- action results: module -> client ----------
 * Reducers cannot both commit and report an error, so actions are Spacetime procedures that return this envelope:
 * `error` is an ErrorCode ('' on success), `metaJson`/`dataJson` are JSON. */
export interface ActionResult { ok: boolean; error: string; metaJson: string; dataJson: string }
export const okResult = <T>(data: T): ActionResult => ({ ok: true, error: '', metaJson: '', dataJson: JSON.stringify(data ?? null) });
export const errResult = (error: ErrorCode, meta?: Record<string, unknown>): ActionResult =>
  ({ ok: false, error, metaJson: meta ? JSON.stringify(meta) : '', dataJson: '' });
export function resultOf<T>(r: ActionResult): Result<T> {
  if (r.ok) return { ok: true, data: (r.dataJson ? JSON.parse(r.dataJson) : null) as T };
  let meta: Record<string, unknown> | undefined;
  if (r.metaJson) { try { meta = JSON.parse(r.metaJson) as Record<string, unknown>; } catch { /* ignore */ } }
  return { ok: false, error: (r.error || 'unknown') as ErrorCode, meta };
}
