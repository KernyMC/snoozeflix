/* eslint-disable @typescript-eslint/no-unused-vars */
// Phase B: implement the same hooks/actions with SpacetimeDB + server routes.
// Until then every export throws so a mis-set NEXT_PUBLIC_DATA_MODE fails loudly.
import type { AccountInfo, RegisterInput, BotReply, BotThreadMessage, CashoutProposal, Checkin, DemoFlags, FeedEvent, Goal, GoalInput, LeaderboardRow, PhotoVerdict, Penalty, Pos, Result, Squad, User, Cents, Wallet, Withdrawal } from '../types';

const nope = (): never => { throw new Error('Live mode is not connected yet (Phase B).'); };
const rej = <T>(): Promise<Result<T>> => Promise.reject(new Error('Live mode is not connected yet (Phase B).'));

export const startBackend = (): (() => void) => () => {};
export const useNow = (_i?: number): number => Date.now();
export const useConnection = (): { status: 'connecting' | 'ready' | 'error'; mode: 'mock' | 'live' } => ({ status: 'error', mode: 'live' });
export const useMe = (): User | null | undefined => nope();
export const useAccount = (): AccountInfo | null => nope();
export const useSquad = (): Squad | null => nope();
export const useSquadMembers = (): User[] => nope();
export const useMyGoals = (): Goal[] => nope();
export const useGoal = (_id: string): Goal | null => nope();
export const useGoalHistory = (_id: string): { checkins: Checkin[]; penalties: Penalty[] } => nope();
export const useActiveCheckin = (_id: string): Checkin | null => nope();
export const useLeaderboard = (): LeaderboardRow[] => nope();
export const useFeed = (_l?: number): FeedEvent[] => nope();
export const usePoolFunders = (): { user: User; totalCents: Cents }[] => nope();
export const useOpenCashout = (): CashoutProposal | null => nope();
export const useBotThread = (): BotThreadMessage[] => nope();
export const useDemoFlags = (): DemoFlags => nope();

export const registerUser = (_i: { name: string; avatar: string }): Promise<Result<User>> => rej();
export const claimSeedUser = (_id: string): Promise<Result<User>> => rej();
export const listSeedUsers = (): Promise<Result<User[]>> => rej();
export const createSquad = (_i: { name: string; poolGoalName: string; poolGoalCents: Cents }): Promise<Result<Squad>> => rej();
export const joinSquad = (_c: string): Promise<Result<Squad>> => rej();
export const createGoal = (_i: GoalInput): Promise<Result<Goal>> => rej();
export const updateGoalPenalty = (_id: string, _b: Cents): Promise<Result<Goal>> => rej();
export const startCheckin = (_id: string, _p: Pos): Promise<Result<Checkin>> => rej();
export const pingCheckin = (_id: string, _p: Pos): Promise<Result<Checkin>> => rej();
export const finishCheckin = (_id: string, _p: string): Promise<Result<{ checkin: Checkin; verdict: PhotoVerdict }>> => rej();
export const forceFlake = (_id: string): Promise<Result<Penalty>> => rej();
export const postMessage = (_t: string): Promise<Result<FeedEvent>> => rej();
export const askBot = (_t: string): Promise<Result<BotReply>> => rej();
export const confirmBotAction = (_id: string): Promise<Result<BotReply>> => rej();
export const proposeCashout = (_m: string): Promise<Result<CashoutProposal>> => rej();
export const voteCashout = (_id: string, _a: boolean): Promise<Result<CashoutProposal>> => rej();
export const cancelCashout = (_id: string): Promise<Result<CashoutProposal>> => rej();
export const setPoolGoal = (_n: string, _c: Cents): Promise<Result<Squad>> => rej();
export const resetDemoData = (): Promise<Result<true>> => rej();
export const setDemoFlags = (_p: Partial<DemoFlags>): Promise<Result<true>> => rej();
export const getDemoFlags = (): DemoFlags => nope();
export const registerAccount = (_i: RegisterInput): Promise<Result<User>> => rej();
export const requestWithdrawal = (_c: Cents): Promise<Result<Withdrawal>> => rej();
export const cancelWithdrawal = (_id: string): Promise<Result<Withdrawal>> => rej();
export const useWallet = (): Wallet | null => nope();
export const useWithdrawals = (): Withdrawal[] => nope();
export const login = (_u: string, _p: string): Promise<Result<User>> => rej();
export const logout = (): Promise<Result<true>> => rej();
export const getSecurityQuestions = (_u: string): Promise<Result<string[]>> => rej();
export const verifySecurityAnswers = (_u: string, _a: string[]): Promise<Result<string>> => rej();
export const resetPassword = (_u: string, _t: string, _p: string, _c: string): Promise<Result<true>> => rej();
export const updateAvatar = (_a: string): Promise<Result<User>> => rej();
export const updateAccountName = (_i: { firstName: string; lastName: string }): Promise<Result<AccountInfo>> => rej();
export const changeEmail = (_e: string, _p: string): Promise<Result<AccountInfo>> => rej();
export const changePassword = (_c: string, _n: string, _k: string): Promise<Result<true>> => rej();
export const updateSecurity = (_p: string, _i: { qId: string; answer: string }[]): Promise<Result<AccountInfo>> => rej();
