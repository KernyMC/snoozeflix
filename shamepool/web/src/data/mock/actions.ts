import type {
  AccountInfo, Address, AddressInput, PaymentMethod, PaymentMethodInput, PlanStart, PlanTier, RegisterInput, AiBotInput, BotReply, CashoutProposal, Checkin, InviteSnapshot, DemoFlags, FeedEvent, Goal, GoalInput, PhotoVerdict, Penalty, Pos, Result, Squad, User, Withdrawal,
} from '../types';
import * as E from './engine';
import * as A from './authEngine';
import * as B from './billingEngine';
import { err } from './state';
import { commit, nowMs, resetAll, setIdentity, useMockStore } from './store';
import { buildBotContext } from './botContext';
import { DEMO_ENABLED } from '@/lib/demo';

const DEMO = DEMO_ENABLED;

function flag(name: string): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get(name) === '1';
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const latency = () => (flag('mockSlow') ? 3000 : 300 + Math.random() * 500);

/** Every action: latency → optional forced error → atomic commit. */
async function run<T>(fn: (c: Parameters<typeof E.createGoal>[0]) => Result<T>): Promise<Result<T>> {
  await sleep(latency());
  if (flag('mockError')) return err('mock_error');
  return commit(fn);
}

const effectivePos = (pos: Pos): Pos => {
  const fake = useMockStore.getState().state.demo.fakeLocation;
  return DEMO && fake ? fake : pos; // C21: spoofing only in demo builds
};

/* identity / squad */
export async function registerUser(input: { name: string; avatar: string }): Promise<Result<User>> {
  const r = await run((c) => E.registerUser(c, input));
  if (r.ok) setIdentity(r.data.id);
  return r;
}
export async function registerAccount(input: RegisterInput): Promise<Result<User>> {
  const r = await run((c) => A.registerAccount(c, input));
  if (r.ok) setIdentity(r.data.id);
  return r;
}
export async function login(username: string, password: string): Promise<Result<User>> {
  const r = await run((c) => A.login(c, username, password));
  if (r.ok) setIdentity(r.data.id);
  return r;
}
export async function logout(): Promise<Result<true>> {
  setIdentity(null);
  return { ok: true, data: true };
}
export const getSecurityQuestions = (username: string): Promise<Result<string[]>> => run((c) => A.getSecurityQuestions(c, username));
export const verifySecurityAnswers = (username: string, answers: string[]): Promise<Result<string>> =>
  run((c) => A.verifySecurityAnswers(c, username, answers));
export const resetPassword = (username: string, token: string, password: string, confirm: string): Promise<Result<true>> =>
  run((c) => A.resetPassword(c, username, token, password, confirm));
/* account management */
export const updateAvatar = (avatar: string): Promise<Result<User>> => run((c) => A.updateAvatar(c, avatar));
export const updateAccountName = (i: { firstName: string; lastName: string }): Promise<Result<AccountInfo>> => run((c) => A.updateAccountName(c, i));
export const changeEmail = (newEmail: string, password: string): Promise<Result<AccountInfo>> => run((c) => A.changeEmail(c, newEmail, password));
export const changePassword = (current: string, next: string, confirm: string): Promise<Result<true>> =>
  run((c) => A.changePassword(c, current, next, confirm));
export const updateSecurity = (password: string, items: { qId: string; answer: string }[]): Promise<Result<AccountInfo>> =>
  run((c) => A.updateSecurity(c, password, items));

export async function claimSeedUser(userId: string): Promise<Result<User>> {
  const r = await run((c) => E.claimSeedUser(c, userId));
  if (r.ok) setIdentity(r.data.id);
  return r;
}
export async function listSeedUsers(): Promise<Result<User[]>> {
  await sleep(latency() / 2);
  const s = useMockStore.getState().state;
  return { ok: true, data: s.seedUserIds.map((id) => s.users[id]).filter(Boolean) };
}
export const createSquad = (i: { name: string; poolGoalName: string; poolGoalCents: number }): Promise<Result<Squad>> => run((c) => E.createSquad(c, i));
export const joinSquad = (code: string, invite?: InviteSnapshot | null): Promise<Result<Squad>> => run((c) => E.joinSquad(c, code, invite));

/* goals */
export const createGoal = (i: GoalInput): Promise<Result<Goal>> => run((c) => E.createGoal(c, i));
export const updateGoalPenalty = (id: string, base: number): Promise<Result<Goal>> => run((c) => E.updateGoalPenalty(c, id, base));

/* check-in */
export const startCheckin = (id: string, pos: Pos): Promise<Result<Checkin>> => run((c) => E.startCheckin(c, id, effectivePos(pos)));
export const pingCheckin = (id: string, pos: Pos): Promise<Result<Checkin>> => run((c) => E.pingCheckin(c, id, effectivePos(pos)));
export const finishCheckin = (id: string, photo: string, ai?: PhotoVerdict | null): Promise<Result<{ checkin: Checkin; verdict: PhotoVerdict }>> =>
  run((c) => E.finishCheckin(c, id, photo, ai));

/* penalties */
export const forceFlake = (goalId: string): Promise<Result<Penalty>> => run((c) => E.forceFlake(c, goalId));

/* social / bot */
export const postMessage = (text: string): Promise<Result<FeedEvent>> => run((c) => E.postMessage(c, text));
export const askBot = (text: string, ai?: AiBotInput): Promise<Result<BotReply>> => run((c) => E.askBot(c, text, ai));
/** Snapshot of the user's app data for the AI bot (sync, no latency). null when signed out or without a squad. */
export function getBotContext(): Record<string, unknown> | null {
  const st = useMockStore.getState();
  return st.userId ? buildBotContext(st.state, st.userId, nowMs()) : null;
}
export const confirmBotAction = (id: string): Promise<Result<BotReply>> => run((c) => E.confirmBotAction(c, id));

/* pool */
export const proposeCashout = (m: string): Promise<Result<CashoutProposal>> => run((c) => E.proposeCashout(c, m));
export const voteCashout = (id: string, approve: boolean): Promise<Result<CashoutProposal>> => run((c) => E.voteCashout(c, id, approve));
export const cancelCashout = (id: string): Promise<Result<CashoutProposal>> => run((c) => E.cancelCashout(c, id));
export const setPoolGoal = (name: string, cents: number): Promise<Result<Squad>> => run((c) => E.setPoolGoal(c, name, cents));

/* wallet */
export const requestWithdrawal = (cents: number): Promise<Result<Withdrawal>> => run((c) => E.requestWithdrawal(c, cents));
export const cancelWithdrawal = (id: string): Promise<Result<Withdrawal>> => run((c) => E.cancelWithdrawal(c, id));

/* plan, payment methods, addresses */
export const setPlanTier = (tier: PlanTier, start: PlanStart = 'monthly'): Promise<Result<PlanTier>> => run((c) => B.setPlanTier(c, tier, start));
export const addPaymentMethod = (i: PaymentMethodInput): Promise<Result<PaymentMethod>> => run((c) => B.addPaymentMethod(c, i));
export const removePaymentMethod = (id: string): Promise<Result<true>> => run((c) => B.removePaymentMethod(c, id));
export const addAddress = (i: AddressInput): Promise<Result<Address>> => run((c) => B.addAddress(c, i));
export const removeAddress = (id: string): Promise<Result<true>> => run((c) => B.removeAddress(c, id));

/* charity */
export const setCharity = (id: string): Promise<Result<Squad>> => run((c) => E.setCharity(c, id));
export const proposeDonation = (): Promise<Result<CashoutProposal>> => run((c) => E.proposeDonation(c));
export const demoExpirePoolDeadline = (): Promise<Result<Squad>> => run((c) => E.demoExpirePoolDeadline(c));

/* demo */
export async function resetDemoData(): Promise<Result<true>> {
  await sleep(200);
  resetAll();
  setIdentity(null);
  return { ok: true, data: true };
}
export async function setDemoFlags(patch: Partial<DemoFlags>): Promise<Result<true>> {
  commit((c) => { c.s.demo = { ...c.s.demo, ...patch }; return 0; });
  return { ok: true, data: true };
}
export function getDemoFlags(): DemoFlags {
  return useMockStore.getState().state.demo;
}
