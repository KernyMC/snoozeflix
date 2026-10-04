'use client';
// Live actions: same names, arguments and Result shapes as mock/actions.ts. Each one calls a Spacetime procedure that runs
// the rule inside the database and returns an ActionResult envelope. Checks that need plaintext (password strength,
// confirm, card numbers) run here first, with the same error codes, and only hashes / last four digits are sent.
import {
  normalizeAnswer, SECURITY_QUESTIONS, validateConfirm, validateEmail, validateFirstName, validateLastName, validatePassword, validateSecurity,
  validateUsername,
} from '../authLogic';
import { cardDigits, detectBrand, parseExpiry, validatePaymentInput } from '../billingLogic';
import { validateGoalInput } from '../logic';
import type {
  AccountInfo, Address, AddressInput, BotReply, CashoutProposal, Cents, Checkin, DemoFlags, ErrorCode, FeedEvent, Goal, GoalInput, PaymentMethod,
  PaymentMethodInput, Penalty, PhotoVerdict, PlanStart, PlanTier, Pos, RegisterInput, Result, Squad, User, Withdrawal,
} from '../types';
import type { DbConnection } from './bindings';
import { demoFlagsOf } from './hooks';
import { planDemoPatch } from './demo';
import { type ActionResult, resultOf } from './mappers';
import { secretHash, sha256Hex } from './sha256';
import { getConn, nowMs, settle, startLive, useLive, whenReady } from './stdb';

const DEMO = process.env.NEXT_PUBLIC_DEMO === 'true';
const fail = (error: ErrorCode): Result<never> => ({ ok: false, error });

/* ---------- Nessie bridge ---------- */
let lastPoke = 0;
let bridgeMissing = false;
/**
 * Ask the server to drain the outbox now (no secret needed: it only runs legitimate queued jobs). Fire and forget.
 * A deploy without the bridge token answers 503 `bridge_not_configured`; the tab then stops asking.
 */
export function pokeBridge(force = false): void {
  const t = Date.now();
  if (bridgeMissing || (!force && t - lastPoke < 3000)) return;
  lastPoke = t;
  try {
    void fetch('/api/bridge/poke', { method: 'POST', keepalive: true })
      .then((r) => { if (r.status === 503) bridgeMissing = true; })
      .catch(() => {});
  } catch { /* ignore */ }
}

/** Opens the connection and keeps the bridge ticking while a tab is visible. */
export function startBackend(): () => void {
  const stop = startLive();
  const id = window.setInterval(() => {
    if (document.visibilityState === 'visible' && useLive.getState().status === 'ready') pokeBridge();
  }, 6000);
  return () => { window.clearInterval(id); stop(); };
}

/* ---------- plumbing ---------- */
async function run<T>(fn: (c: DbConnection) => Promise<ActionResult>, bridge = false): Promise<Result<T>> {
  let c: DbConnection;
  try { c = await whenReady(); } catch { return fail('offline'); }
  try {
    const r = resultOf<T>(await fn(c));
    if (bridge) pokeBridge();
    return r;
  } catch (e) {
    console.warn('[live] action failed', e);
    return fail('unknown');
  }
}

const effectivePos = (pos: Pos): Pos => {
  const fake = useLive.getState().fakeLocation;
  return DEMO && fake ? fake : pos; // spoofing only in demo builds, and only for this tab
};
const myUsername = (): string | null => useLive.getState().account?.username ?? null;
const hashAnswer = (username: string, answer: string) => secretHash(username, 'ans', normalizeAnswer(answer));

/* ---------- identity ---------- */
export async function registerUser(input: { name: string; avatar: string }): Promise<Result<User>> {
  const r = await run<User>((c) => c.procedures.registerUser(input), true);
  if (r.ok) await settle((s) => s.me?.id === r.data.id);
  return r;
}

export async function registerAccount(i: RegisterInput): Promise<Result<User>> {
  const bad = validateFirstName(i.firstName) ?? validateLastName(i.lastName) ?? validateEmail(i.email) ?? validateUsername(i.username)
    ?? validatePassword(i.password) ?? validateConfirm(i.password, i.confirm) ?? validateSecurity(i.security);
  if (bad) return fail(bad);
  const r = await run<User>((c) => c.procedures.registerAccount({
    firstName: i.firstName, lastName: i.lastName, email: i.email, username: i.username, passwordHash: secretHash(i.username, 'pw', i.password),
    security: i.security.map((s) => ({ qId: s.qId, answerHash: hashAnswer(i.username, s.answer) })),
  }), true);
  if (r.ok) await settle((s) => s.me?.id === r.data.id);
  return r;
}

export async function login(username: string, password: string): Promise<Result<User>> {
  const r = await run<User>((c) => c.procedures.login({ username, passwordHash: secretHash(username, 'pw', password) }));
  if (r.ok) await settle((s) => s.me?.id === r.data.id);
  return r;
}

export async function logout(): Promise<Result<true>> {
  const c = getConn();
  try { await c?.reducers.logout({}); } catch (e) { console.warn('[live] logout failed', e); }
  await settle((s) => s.me === null, 1500);
  return { ok: true, data: true };
}

export async function getSecurityQuestions(username: string): Promise<Result<string[]>> {
  const r = await run<string[]>((c) => c.procedures.getSecurityQuestionIds({ username }));
  if (!r.ok) return r;
  return { ok: true, data: r.data.map((id) => SECURITY_QUESTIONS.find((q) => q.id === id)?.text ?? '') };
}

export const verifySecurityAnswers = (username: string, answers: string[]): Promise<Result<string>> =>
  run<string>((c) => c.procedures.verifySecurityAnswers({ username, answerHashes: answers.map((a) => hashAnswer(username, a)) }));

export async function resetPassword(username: string, token: string, password: string, confirm: string): Promise<Result<true>> {
  const bad = validatePassword(password) ?? validateConfirm(password, confirm);
  if (bad) return fail(bad);
  return run<true>((c) => c.procedures.resetPassword({ username, token, passwordHash: secretHash(username, 'pw', password) }));
}

/** Password-less seed sign-in is off on the shared database (anyone could act as Kevin). Seed users log in with a password. */
export async function claimSeedUser(_userId: string): Promise<Result<User>> { // eslint-disable-line @typescript-eslint/no-unused-vars
  return fail('not_available');
}

export async function listSeedUsers(): Promise<Result<User[]>> {
  try { await whenReady(); } catch { return fail('offline'); }
  return {
    ok: true,
    data: useLive.getState().users.filter((u) => u.isSeed).map((u) => ({ id: u.id, name: u.name, avatar: u.avatar, squadId: u.squadId || null, balanceCents: u.balanceCents }))
      .sort((a, b) => a.id.localeCompare(b.id)).sort((a, b) => ['seed_kevin', 'seed_ana', 'seed_leo', 'seed_maya'].indexOf(a.id) - ['seed_kevin', 'seed_ana', 'seed_leo', 'seed_maya'].indexOf(b.id)),
  };
}

/* ---------- account management ---------- */
export async function updateAvatar(avatar: string): Promise<Result<User>> {
  const r = await run<User>((c) => c.procedures.updateAvatar({ avatar }));
  if (r.ok) await settle((s) => s.me?.avatar === r.data.avatar);
  return r;
}
export async function updateAccountName(i: { firstName: string; lastName: string }): Promise<Result<AccountInfo>> {
  const bad = validateFirstName(i.firstName) ?? validateLastName(i.lastName);
  if (bad) return fail(bad);
  const r = await run<AccountInfo>((c) => c.procedures.updateAccountName(i));
  if (r.ok) await settle((s) => s.account?.firstName === r.data.firstName && s.account?.lastName === r.data.lastName);
  return r;
}
export async function changeEmail(newEmail: string, password: string): Promise<Result<AccountInfo>> {
  const bad = validateEmail(newEmail);
  if (bad) return fail(bad);
  const u = myUsername();
  if (!u) return fail(useLive.getState().me ? 'no_account' : 'no_user');
  const r = await run<AccountInfo>((c) => c.procedures.changeEmail({ newEmail, passwordHash: secretHash(u, 'pw', password) }));
  if (r.ok) await settle((s) => s.account?.email === r.data.email);
  return r;
}
export async function changePassword(current: string, next: string, confirm: string): Promise<Result<true>> {
  const u = myUsername();
  if (!u) return fail(useLive.getState().me ? 'no_account' : 'no_user');
  const bad = validatePassword(next) ?? validateConfirm(next, confirm);
  if (bad) return fail(bad);
  if (next === current) return fail('same_password');
  return run<true>((c) => c.procedures.changePassword({ currentHash: secretHash(u, 'pw', current), nextHash: secretHash(u, 'pw', next) }));
}
export async function updateSecurity(password: string, items: { qId: string; answer: string }[]): Promise<Result<AccountInfo>> {
  const u = myUsername();
  if (!u) return fail(useLive.getState().me ? 'no_account' : 'no_user');
  const bad = validateSecurity(items);
  if (bad) return fail(bad);
  const r = await run<AccountInfo>((c) => c.procedures.updateSecurity({
    passwordHash: secretHash(u, 'pw', password), items: items.map((s) => ({ qId: s.qId, answerHash: hashAnswer(u, s.answer) })),
  }));
  if (r.ok) await settle((s) => JSON.stringify(s.account?.securityQuestionIds) === JSON.stringify(r.data.securityQuestionIds));
  return r;
}

/* ---------- plan, cards, addresses ---------- */
export async function setPlanTier(tier: PlanTier, start: PlanStart = 'monthly'): Promise<Result<PlanTier>> {
  const r = await run<PlanTier>((c) => c.procedures.setPlanTier({ tier, start }));
  if (r.ok) await settle((s) => s.plan?.tier === r.data);
  return r;
}
/** The full card number and CVC are validated here and dropped; only brand, last four and expiry reach Spacetime. */
export async function addPaymentMethod(i: PaymentMethodInput): Promise<Result<PaymentMethod>> {
  const bad = validatePaymentInput(i, nowMs());
  if (bad) return fail(bad);
  const exp = parseExpiry(i.expiry);
  const brand = detectBrand(i.cardNumber);
  if (!exp || !brand) return fail('invalid_card_number');
  const r = await run<PaymentMethod>((c) => c.procedures.addPaymentMethod({
    nickname: i.nickname, nameOnCard: i.nameOnCard, brand, last4: cardDigits(i.cardNumber).slice(-4), expMonth: exp.month, expYear: exp.year,
    addressId: i.addressId ?? '',
  }));
  if (r.ok) await settle((s) => s.payments.some((p) => p.id === r.data.id));
  return r;
}
export async function removePaymentMethod(id: string): Promise<Result<true>> {
  const r = await run<true>((c) => c.procedures.removePaymentMethod({ id }));
  if (r.ok) await settle((s) => !s.payments.some((p) => p.id === id));
  return r;
}
export async function addAddress(i: AddressInput): Promise<Result<Address>> {
  const r = await run<Address>((c) => c.procedures.addAddress(i));
  if (r.ok) await settle((s) => s.addresses.some((a) => a.id === r.data.id));
  return r;
}
export async function removeAddress(id: string): Promise<Result<true>> {
  const r = await run<true>((c) => c.procedures.removeAddress({ id }));
  if (r.ok) await settle((s) => !s.addresses.some((a) => a.id === id));
  return r;
}

/* ---------- squads and goals ---------- */
export async function createSquad(i: { name: string; poolGoalName: string; poolGoalCents: Cents }): Promise<Result<Squad>> {
  if (!Number.isInteger(i.poolGoalCents)) return fail('invalid_amount');
  const r = await run<Squad>((c) => c.procedures.createSquad(i), true);
  if (r.ok) await settle((s) => s.me?.squadId === r.data.id && s.squads.some((q) => q.id === r.data.id));
  return r;
}
/** The invite snapshot (`s=` in QR links) only helps mock devices that never saw the squad; live squads really exist. */
export async function joinSquad(code: string, _invite?: unknown): Promise<Result<Squad>> { // eslint-disable-line @typescript-eslint/no-unused-vars
  const r = await run<Squad>((c) => c.procedures.joinSquad({ code }));
  if (r.ok) await settle((s) => s.me?.squadId === r.data.id && s.squads.some((q) => q.id === r.data.id));
  return r;
}
export async function createGoal(i: GoalInput): Promise<Result<Goal>> {
  const bad = validateGoalInput(i);
  if (bad) return fail(bad);
  const r = await run<Goal>((c) => c.procedures.createGoal({
    title: i.title, emoji: i.emoji, lat: i.lat, lng: i.lng, radiusM: i.radiusM, daysOfWeek: Uint8Array.from(i.daysOfWeek), deadlineMinutes: i.deadlineMinutes,
    minStayMinutes: i.minStayMinutes, basePenaltyCents: i.basePenaltyCents, maxPenaltyCents: i.maxPenaltyCents,
  }));
  if (r.ok) await settle((s) => s.goals.some((g) => g.id === r.data.id));
  return r;
}
export async function updateGoalPenalty(id: string, base: Cents): Promise<Result<Goal>> {
  if (!Number.isInteger(base)) return fail('invalid_penalty');
  const r = await run<Goal>((c) => c.procedures.updateGoalPenalty({ goalId: id, baseCents: base }));
  if (r.ok) await settle((s) => s.goals.find((g) => g.id === id)?.basePenaltyCents === base);
  return r;
}

/* ---------- check-in ---------- */
export async function startCheckin(goalId: string, pos: Pos): Promise<Result<Checkin>> {
  const p = effectivePos(pos);
  if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return fail('invalid_location');
  const r = await run<Checkin>((c) => c.procedures.startCheckin({ goalId, lat: p.lat, lng: p.lng, accuracyM: p.accuracyM ?? 0 }));
  if (r.ok) await settle((s) => s.checkins.some((x) => x.id === r.data.id));
  return r;
}
export function pingCheckin(checkinId: string, pos: Pos): Promise<Result<Checkin>> {
  const p = effectivePos(pos);
  return run<Checkin>((c) => c.procedures.pingCheckin({ checkinId, lat: p.lat, lng: p.lng, accuracyM: p.accuracyM ?? 0 }));
}
/**
 * The photo itself never leaves the browser: only its size and a fingerprint go to the module (it would be megabytes of
 * base64). TODO: post it to the AI verification route and let the bridge call a verdict reducer.
 */
export function finishCheckin(checkinId: string, photo: string, _ai?: unknown): Promise<Result<{ checkin: Checkin; verdict: PhotoVerdict }>> { // eslint-disable-line @typescript-eslint/no-unused-vars
  if (typeof photo !== 'string' || photo.length < 8) return Promise.resolve(fail('invalid_photo'));
  const fingerprint = sha256Hex(`${photo.length}:${photo.slice(0, 2048)}:${photo.slice(-2048)}`);
  return run((c) => c.procedures.finishCheckin({ checkinId, photoLen: photo.length, photoFingerprint: fingerprint }));
}

/* ---------- penalties, social, bot ---------- */
export const forceFlake = (goalId: string): Promise<Result<Penalty>> => run<Penalty>((c) => c.procedures.forceFlake({ goalId }), true);
export const postMessage = (text: string): Promise<Result<FeedEvent>> => run<FeedEvent>((c) => c.procedures.postMessage({ text }));
export async function askBot(text: string, _ai?: unknown): Promise<Result<BotReply>> { // eslint-disable-line @typescript-eslint/no-unused-vars
  const r = await run<BotReply>((c) => c.procedures.askBot({ text }));
  if (r.ok) await settle((s) => s.bot.some((m) => m.fromBot && m.text === r.data.text), 1500);
  return r;
}
export async function confirmBotAction(id: string): Promise<Result<BotReply>> {
  const r = await run<BotReply>((c) => c.procedures.confirmBotAction({ actionId: id }));
  if (r.ok) await settle((s) => s.bot.some((m) => m.fromBot && m.text === r.data.text), 1500);
  return r;
}

/* ---------- pool, cash-out, wallet ---------- */
export const proposeCashout = (merchant: string): Promise<Result<CashoutProposal>> => run<CashoutProposal>((c) => c.procedures.proposeCashout({ merchant }), true);
export const voteCashout = (proposalId: string, approve: boolean): Promise<Result<CashoutProposal>> =>
  run<CashoutProposal>((c) => c.procedures.voteCashout({ proposalId, approve }), true);
export const cancelCashout = (proposalId: string): Promise<Result<CashoutProposal>> => run<CashoutProposal>((c) => c.procedures.cancelCashout({ proposalId }));
export async function setPoolGoal(name: string, cents: Cents): Promise<Result<Squad>> {
  if (!Number.isInteger(cents)) return fail('invalid_amount');
  const r = await run<Squad>((c) => c.procedures.setPoolGoal({ name, cents }));
  if (r.ok) await settle((s) => s.squads.find((q) => q.id === r.data.id)?.poolGoalCents === cents);
  return r;
}
export async function requestWithdrawal(cents: Cents): Promise<Result<Withdrawal>> {
  if (!Number.isInteger(cents) || cents <= 0) return fail('invalid_amount');
  const r = await run<Withdrawal>((c) => c.procedures.requestWithdrawal({ cents }));
  if (r.ok) await settle((s) => s.withdrawals.some((w) => w.id === r.data.id));
  return r;
}
export async function cancelWithdrawal(id: string): Promise<Result<Withdrawal>> {
  const r = await run<Withdrawal>((c) => c.procedures.cancelWithdrawal({ withdrawalId: id }));
  if (r.ok) await settle((s) => s.withdrawals.find((w) => w.id === id)?.status === 'cancelled');
  return r;
}

/* ---------- demo ---------- */
/** Wiping the shared database would delete every real squad, so only the bridge identity may reset it (not a browser). */
export async function resetDemoData(): Promise<Result<true>> {
  return fail('not_available');
}
/**
 * Fake location stays in this tab. "Next photo fails" goes to the module. Moving the clock is global on the shared
 * database (the scheduler would charge every squad), so it is refused with `not_available`.
 */
export async function setDemoFlags(patch: Partial<DemoFlags>): Promise<Result<true>> {
  const plan = planDemoPatch(patch, useLive.getState().flags?.timeOffsetMs ?? 0);
  if (plan.refuse) return fail('not_available');
  if (plan.fake !== undefined) useLive.setState({ fakeLocation: plan.fake });
  if (plan.nextPhotoFails === undefined) return { ok: true, data: true };
  try {
    const c = await whenReady();
    await c.reducers.setDemoFlags({
      patch: {
        setNextPhotoFails: true, nextPhotoFails: plan.nextPhotoFails, setFake: false, fakeOn: false, fakeLat: 0, fakeLng: 0, fakeAcc: 0,
        setOffset: false, timeOffsetMs: 0,
      },
    });
    return { ok: true, data: true };
  } catch (e) {
    console.warn('[live] setDemoFlags failed', e);
    return fail('unknown');
  }
}
export const getDemoFlags = (): DemoFlags => demoFlagsOf(useLive.getState().flags, useLive.getState().fakeLocation);
