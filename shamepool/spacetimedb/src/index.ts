// ShamePool backend. Spacetime holds all state and rules; clients subscribe to public tables and call the procedures
// below. Procedures (not reducers) carry the app actions because a reducer cannot both commit and report an error
// (failed logins, left-area check-ins and rejected photos must persist) and cannot return created entities.
// Reducers are used for the scheduler, the bridge, demo flags and logout. No network I/O happens in the module;
// external effects go through the `outbox` table, drained by the Next.js bridge (web/src/server/stdb-bridge.ts).
import { t, SenderError, ScheduleAt } from 'spacetimedb/server';
import { Timestamp } from 'spacetimedb';
import spacetimedb, { address, billingPlan, botMessage, deadlineTick, nessieLink, outbox, paymentMethod, user } from './schema';
import * as Auth from './auth';
import * as Billing from './billing';
import * as Game from './game';
import * as Bot from './botchat';
import { type Env, type Ctx, envOf, sessionUser, err, ok, realNowMs } from './core';
import { seedDemo } from './seed';
import { errResult, okResult, type ActionResult } from './shared/mappers';
import type { PlanStart, PlanTier, Result } from './shared/types';

export default spacetimedb;

/* ---------- lifecycle ---------- */
export const init = spacetimedb.init((ctx) => {
  seedDemo(ctx, false);
  ctx.db.deadlineTick.insert({ scheduledId: 0n, scheduledAt: ScheduleAt.interval(60_000_000n) });
});

/* ---------- action plumbing ---------- */
const ActionResultT = t.object('ActionResult', { ok: t.bool(), error: t.string(), metaJson: t.string(), dataJson: t.string() });

/** Run an engine function in its own transaction and return the typed envelope the client turns into a Result. */
function act(ctx: { withTx<T>(body: (tx: Ctx) => T): T }, fn: (env: Env) => Result<unknown>): ActionResult {
  return ctx.withTx((tx) => {
    const r = fn(envOf(tx, sessionUser(tx)));
    return r.ok ? okResult(r.data) : errResult(r.error, r.meta);
  });
}

const HashedAnswer = t.object('HashedAnswer', { qId: t.string(), answerHash: t.string() });

/* ---------- accounts ---------- */
export const registerUser = spacetimedb.procedure({ name: t.string(), avatar: t.string() }, ActionResultT,
  (ctx, a) => act(ctx, (e) => Auth.registerUser(e, a)));
export const registerAccount = spacetimedb.procedure(
  { firstName: t.string(), lastName: t.string(), email: t.string(), username: t.string(), passwordHash: t.string(), security: t.array(HashedAnswer) },
  ActionResultT, (ctx, a) => act(ctx, (e) => Auth.registerAccount(e, a)));
export const login = spacetimedb.procedure({ username: t.string(), passwordHash: t.string() }, ActionResultT,
  (ctx, a) => act(ctx, (e) => Auth.login(e, a.username, a.passwordHash)));
export const claimSeedUser = spacetimedb.procedure({ userId: t.string() }, ActionResultT, (ctx, a) => act(ctx, (e) => Auth.claimSeedUser(e, a.userId)));
export const getSecurityQuestionIds = spacetimedb.procedure({ username: t.string() }, ActionResultT,
  (ctx, a) => act(ctx, (e) => Auth.getSecurityQuestionIds(e, a.username)));
export const verifySecurityAnswers = spacetimedb.procedure({ username: t.string(), answerHashes: t.array(t.string()) }, ActionResultT,
  (ctx, a) => act(ctx, (e) => Auth.verifySecurityAnswers(e, a.username, a.answerHashes)));
export const resetPassword = spacetimedb.procedure({ username: t.string(), token: t.string(), passwordHash: t.string() }, ActionResultT,
  (ctx, a) => act(ctx, (e) => Auth.resetPassword(e, a.username, a.token, a.passwordHash)));
export const updateAvatar = spacetimedb.procedure({ avatar: t.string() }, ActionResultT, (ctx, a) => act(ctx, (e) => Auth.updateAvatar(e, a.avatar)));
export const updateAccountName = spacetimedb.procedure({ firstName: t.string(), lastName: t.string() }, ActionResultT,
  (ctx, a) => act(ctx, (e) => Auth.updateAccountName(e, a)));
export const changeEmail = spacetimedb.procedure({ newEmail: t.string(), passwordHash: t.string() }, ActionResultT,
  (ctx, a) => act(ctx, (e) => Auth.changeEmail(e, a.newEmail, a.passwordHash)));
export const changePassword = spacetimedb.procedure({ currentHash: t.string(), nextHash: t.string() }, ActionResultT,
  (ctx, a) => act(ctx, (e) => Auth.changePassword(e, a.currentHash, a.nextHash)));
export const updateSecurity = spacetimedb.procedure({ passwordHash: t.string(), items: t.array(HashedAnswer) }, ActionResultT,
  (ctx, a) => act(ctx, (e) => Auth.updateSecurity(e, a.passwordHash, a.items)));
export const logout = spacetimedb.reducer((ctx) => {
  Auth.logout(envOf(ctx, sessionUser(ctx)));
});

/* ---------- billing ---------- */
export const setPlanTier = spacetimedb.procedure({ tier: t.string(), start: t.string() }, ActionResultT,
  (ctx, a) => act(ctx, (e) => Billing.setPlanTier(e, a.tier as PlanTier, a.start as PlanStart)));
export const addPaymentMethod = spacetimedb.procedure(
  {
    nickname: t.string(), nameOnCard: t.string(), brand: t.string(), last4: t.string(), expMonth: t.i32(), expYear: t.i32(), addressId: t.string(),
  }, ActionResultT, (ctx, a) => act(ctx, (e) => Billing.addPaymentMethod(e, a)));
export const removePaymentMethod = spacetimedb.procedure({ id: t.string() }, ActionResultT, (ctx, a) => act(ctx, (e) => Billing.removePaymentMethod(e, a.id)));
export const addAddress = spacetimedb.procedure(
  { label: t.string(), fullName: t.string(), line1: t.string(), line2: t.string(), city: t.string(), state: t.string(), zip: t.string() },
  ActionResultT, (ctx, a) => act(ctx, (e) => Billing.addAddress(e, a)));
export const removeAddress = spacetimedb.procedure({ id: t.string() }, ActionResultT, (ctx, a) => act(ctx, (e) => Billing.removeAddress(e, a.id)));

/* ---------- squads and goals ---------- */
export const createSquad = spacetimedb.procedure({ name: t.string(), poolGoalName: t.string(), poolGoalCents: t.i32() }, ActionResultT,
  (ctx, a) => act(ctx, (e) => Game.createSquad(e, a)));
export const joinSquad = spacetimedb.procedure({ code: t.string() }, ActionResultT, (ctx, a) => act(ctx, (e) => Game.joinSquad(e, a.code)));
export const createGoal = spacetimedb.procedure(
  {
    title: t.string(), emoji: t.string(), lat: t.f64(), lng: t.f64(), radiusM: t.f64(), daysOfWeek: t.array(t.u8()), deadlineMinutes: t.i32(),
    minStayMinutes: t.i32(), basePenaltyCents: t.i32(), maxPenaltyCents: t.i32(),
  }, ActionResultT, (ctx, a) => act(ctx, (e) => Game.createGoal(e, { ...a, daysOfWeek: [...a.daysOfWeek] })));
export const updateGoalPenalty = spacetimedb.procedure({ goalId: t.string(), baseCents: t.i32() }, ActionResultT,
  (ctx, a) => act(ctx, (e) => Game.updateGoalPenalty(e, a.goalId, a.baseCents)));

/* ---------- check-ins ---------- */
export const startCheckin = spacetimedb.procedure({ goalId: t.string(), lat: t.f64(), lng: t.f64(), accuracyM: t.f64() }, ActionResultT,
  (ctx, a) => act(ctx, (e) => Game.startCheckin(e, a.goalId, { lat: a.lat, lng: a.lng, accuracyM: a.accuracyM }) as Result<unknown>));
export const pingCheckin = spacetimedb.procedure({ checkinId: t.string(), lat: t.f64(), lng: t.f64(), accuracyM: t.f64() }, ActionResultT,
  (ctx, a) => act(ctx, (e) => Game.pingCheckin(e, a.checkinId, { lat: a.lat, lng: a.lng, accuracyM: a.accuracyM }) as Result<unknown>));
export const finishCheckin = spacetimedb.procedure({ checkinId: t.string(), photoLen: t.f64(), photoFingerprint: t.string() }, ActionResultT,
  (ctx, a) => act(ctx, (e) => Game.finishCheckin(e, a.checkinId, a.photoLen) as Result<unknown>));

/* ---------- penalties, feed, bot ---------- */
export const forceFlake = spacetimedb.procedure({ goalId: t.string() }, ActionResultT, (ctx, a) => act(ctx, (e) => Game.forceFlake(e, a.goalId) as Result<unknown>));
export const postMessage = spacetimedb.procedure({ text: t.string() }, ActionResultT, (ctx, a) => act(ctx, (e) => Game.postMessage(e, a.text) as Result<unknown>));
export const askBot = spacetimedb.procedure({ text: t.string() }, ActionResultT, (ctx, a) => act(ctx, (e) => Bot.askBot(e, a.text) as Result<unknown>));
export const confirmBotAction = spacetimedb.procedure({ actionId: t.string() }, ActionResultT,
  (ctx, a) => act(ctx, (e) => Bot.confirmBotAction(e, a.actionId) as Result<unknown>));

/* ---------- pool, cash-out, withdrawals ---------- */
export const setPoolGoal = spacetimedb.procedure({ name: t.string(), cents: t.i32() }, ActionResultT,
  (ctx, a) => act(ctx, (e) => Game.setPoolGoal(e, a.name, a.cents) as Result<unknown>));
export const proposeCashout = spacetimedb.procedure({ merchant: t.string() }, ActionResultT,
  (ctx, a) => act(ctx, (e) => Game.proposeCashout(e, a.merchant) as Result<unknown>));
export const voteCashout = spacetimedb.procedure({ proposalId: t.string(), approve: t.bool() }, ActionResultT,
  (ctx, a) => act(ctx, (e) => Game.voteCashout(e, a.proposalId, a.approve) as Result<unknown>));
export const cancelCashout = spacetimedb.procedure({ proposalId: t.string() }, ActionResultT,
  (ctx, a) => act(ctx, (e) => Game.cancelCashout(e, a.proposalId) as Result<unknown>));
export const requestWithdrawal = spacetimedb.procedure({ cents: t.i32() }, ActionResultT,
  (ctx, a) => act(ctx, (e) => Game.requestWithdrawal(e, a.cents) as Result<unknown>));
export const cancelWithdrawal = spacetimedb.procedure({ withdrawalId: t.string() }, ActionResultT,
  (ctx, a) => act(ctx, (e) => Game.cancelWithdrawal(e, a.withdrawalId) as Result<unknown>));

/* ---------- scheduler: deadlines + withdrawal settlement, every 60 s, with catch-up ---------- */
export const checkDeadlines = spacetimedb.reducer({ onSchedule: deadlineTick }, { arg: deadlineTick.rowType }, (ctx) => {
  const env = envOf(ctx, null);
  const flaked = Game.evaluateDeadlines(env);
  const settled = Game.settleWithdrawals(env);
  if (flaked || settled) console.info(`check_deadlines: ${flaked} flaked, ${settled} withdrawals settled`);
});

/* ---------- demo controls ---------- */
const DemoPatch = t.object('DemoPatch', {
  setNextPhotoFails: t.bool(), nextPhotoFails: t.bool(), setFake: t.bool(), fakeOn: t.bool(), fakeLat: t.f64(), fakeLng: t.f64(), fakeAcc: t.f64(),
  setOffset: t.bool(), timeOffsetMs: t.f64(),
});
export const setDemoFlags = spacetimedb.reducer({ patch: DemoPatch }, (ctx, { patch }) => {
  const f = ctx.db.demoFlags.id.find(0);
  if (!f) throw new SenderError('unknown');
  if (!f.demoMode) throw new SenderError('unknown');
  ctx.db.demoFlags.id.update({
    ...f,
    nextPhotoFails: patch.setNextPhotoFails ? patch.nextPhotoFails : f.nextPhotoFails,
    fakeOn: patch.setFake ? patch.fakeOn : f.fakeOn,
    fakeLat: patch.setFake ? patch.fakeLat : f.fakeLat,
    fakeLng: patch.setFake ? patch.fakeLng : f.fakeLng,
    fakeAcc: patch.setFake ? patch.fakeAcc : f.fakeAcc,
    timeOffsetMs: patch.setOffset ? patch.timeOffsetMs : f.timeOffsetMs,
  });
});
export const resetDemo = spacetimedb.reducer((ctx) => {
  const f = ctx.db.demoFlags.id.find(0);
  if (f && !f.demoMode) throw new SenderError('unknown');
  seedDemo(ctx);
});
/** Bridge only: turn demo helpers (force flake, fake location, reset) on or off. */
export const setDemoMode = spacetimedb.reducer({ on: t.bool() }, (ctx, { on }) => {
  requireBridge(ctx);
  const f = ctx.db.demoFlags.id.find(0);
  if (f) ctx.db.demoFlags.id.update({ ...f, demoMode: on });
});

/* ---------- bridge: the only identity that may read the outbox or write Nessie results ---------- */
function bridgeIdentity(ctx: Ctx) {
  return ctx.db.bridge.id.find(0)?.identity ?? null;
}
function requireBridge(ctx: Ctx): void {
  const b = bridgeIdentity(ctx);
  if (!b || !b.isEqual(ctx.sender)) throw new SenderError('not_bridge');
}

/** First caller wins. Run once with scripts/bridge-token.ts. */
export const claimBridge = spacetimedb.reducer((ctx) => {
  if (bridgeIdentity(ctx)) throw new SenderError('bridge_already_claimed');
  ctx.db.bridge.insert({ id: 0, identity: ctx.sender });
});

/** Bridge-only views over the outbox and the Nessie ids. They are empty for every other identity. */
export const bridgeOutbox = spacetimedb.view({ name: 'bridge_outbox', public: true }, t.array(outbox.rowType), (ctx) => {
  const b = ctx.db.bridge.id.find(0);
  if (!b || !b.identity.isEqual(ctx.sender)) return [];
  return [...ctx.db.outbox.iter()].filter((r) => r.status === 'pending').sort((x, y) => Number(x.id - y.id)).slice(0, 50);
});
export const bridgeLinks = spacetimedb.view({ name: 'bridge_links', public: true }, t.array(nessieLink.rowType), (ctx) => {
  const b = ctx.db.bridge.id.find(0);
  if (!b || !b.identity.isEqual(ctx.sender)) return [];
  return [...ctx.db.nessieLink.iter()];
});

const parse = (json: string): Record<string, unknown> => { try { return JSON.parse(json) as Record<string, unknown>; } catch { return {}; } };

/** Applies a finished Nessie job: stores ids, marks the job done. Idempotent. */
export const outboxDone = spacetimedb.reducer({ id: t.u64(), resultJson: t.string() }, (ctx, { id, resultJson }) => {
  requireBridge(ctx);
  const job = ctx.db.outbox.id.find(id);
  if (!job) throw new SenderError('job_not_found');
  if (job.status === 'done') return;
  const p = parse(job.payload);
  const r = parse(resultJson);
  const str = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
  switch (job.kind) {
    case 'nessie_create_user':
    case 'nessie_create_pool': {
      const key = job.kind === 'nessie_create_user' ? `u:${str(p.userId)}` : `s:${str(p.squadId)}`;
      const row = { key, customerId: str(r.customerId), accountId: str(r.accountId) };
      if (ctx.db.nessieLink.key.find(key)) ctx.db.nessieLink.key.update(row); else ctx.db.nessieLink.insert(row);
      break;
    }
    case 'nessie_transfer': {
      const pen = ctx.db.penalty.id.find(str(p.penaltyId));
      if (pen) ctx.db.penalty.id.update({ ...pen, nessieTransferId: str(r.transferId) });
      break;
    }
    case 'nessie_withdraw': {
      const w = ctx.db.withdrawal.id.find(str(p.withdrawalId));
      if (w) ctx.db.withdrawal.id.update({ ...w, nessieWithdrawalId: str(r.withdrawalId) });
      break;
    }
    case 'nessie_purchase': {
      const co = ctx.db.cashout.id.find(str(p.cashoutId));
      if (co) ctx.db.cashout.id.update({ ...co, nessiePurchaseId: str(r.purchaseId) });
      break;
    }
    default:
      break;
  }
  ctx.db.outbox.id.update({ ...job, status: 'done', result: resultJson.slice(0, 2000) });
});

const MAX_ATTEMPTS = 5;
/** A failed attempt: retry with exponential backoff (5 s, 10 s, 20 s ...) until MAX_ATTEMPTS or a non-retryable error. */
export const outboxFail = spacetimedb.reducer({ id: t.u64(), error: t.string(), retryable: t.bool() }, (ctx, { id, error, retryable }) => {
  requireBridge(ctx);
  const job = ctx.db.outbox.id.find(id);
  if (!job || job.status !== 'pending') return;
  const attempts = job.attempts + 1;
  const final = !retryable || attempts >= MAX_ATTEMPTS;
  const delayMicros = BigInt(5_000 * 2 ** (attempts - 1)) * 1000n;
  ctx.db.outbox.id.update({
    ...job, attempts, status: final ? 'failed' : 'pending', result: error.slice(0, 500),
    nextTryAt: final ? job.nextTryAt : new Timestamp(ctx.timestamp.microsSinceUnixEpoch + delayMicros),
  });
});

/** The job is waiting on something else (e.g. a Nessie id that does not exist yet): retry later without counting an attempt. */
export const outboxRequeue = spacetimedb.reducer({ id: t.u64(), delayMs: t.u32(), note: t.string() }, (ctx, { id, delayMs, note }) => {
  requireBridge(ctx);
  const job = ctx.db.outbox.id.find(id);
  if (!job || job.status !== 'pending') return;
  ctx.db.outbox.id.update({ ...job, result: note.slice(0, 500), nextTryAt: new Timestamp(ctx.timestamp.microsSinceUnixEpoch + BigInt(delayMs) * 1000n) });
});

/* ---------- per-user private views ---------- */
const AccountSelf = t.row('AccountSelf', {
  userId: t.string().primaryKey(), username: t.string(), email: t.string(), firstName: t.string(), lastName: t.string(), securityQuestionIds: t.array(t.string()),
});
export const myUser = spacetimedb.view({ name: 'my_user', public: true }, t.option(user.rowType), (ctx) => {
  const uid = sessionUser(ctx as unknown as Ctx);
  return uid ? ctx.db.user.id.find(uid) ?? undefined : undefined;
});
export const myAccount = spacetimedb.view({ name: 'my_account', public: true }, t.option(AccountSelf), (ctx) => {
  const uid = sessionUser(ctx as unknown as Ctx);
  const a = uid ? [...ctx.db.account.userId.filter(uid)][0] : undefined;
  return a ? { userId: a.userId, ...Auth.accountInfoRow(a) } : undefined;
});
export const myBillingPlan = spacetimedb.view({ name: 'my_billing_plan', public: true }, t.option(billingPlan.rowType), (ctx) => {
  const uid = sessionUser(ctx as unknown as Ctx);
  return uid ? ctx.db.billingPlan.userId.find(uid) ?? undefined : undefined;
});
export const myAddresses = spacetimedb.view({ name: 'my_addresses', public: true }, t.array(address.rowType), (ctx) => {
  const uid = sessionUser(ctx as unknown as Ctx);
  return uid ? [...ctx.db.address.userId.filter(uid)] : [];
});
export const myPaymentMethods = spacetimedb.view({ name: 'my_payment_methods', public: true }, t.array(paymentMethod.rowType), (ctx) => {
  const uid = sessionUser(ctx as unknown as Ctx);
  return uid ? [...ctx.db.paymentMethod.userId.filter(uid)] : [];
});
export const myBotMessages = spacetimedb.view({ name: 'my_bot_messages', public: true }, t.array(botMessage.rowType), (ctx) => {
  const uid = sessionUser(ctx as unknown as Ctx);
  return uid ? [...ctx.db.botMessage.userId.filter(uid)] : [];
});

void err; void ok; void realNowMs;
