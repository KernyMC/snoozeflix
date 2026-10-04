// Live data layer: Spacetime (Maincloud) holds all state and rules; money moves through the outbox + Nessie bridge.
// Exports exactly the names of ../mock so ../index.ts can switch on NEXT_PUBLIC_DATA_MODE.
export {
  startBackend, registerUser, registerAccount, login, logout, getSecurityQuestions, verifySecurityAnswers, resetPassword, claimSeedUser, listSeedUsers,
  updateAvatar, updateAccountName, changeEmail, changePassword, updateSecurity, setPlanTier, addPaymentMethod, removePaymentMethod, addAddress, removeAddress,
  createSquad, joinSquad, createGoal, updateGoalPenalty, startCheckin, pingCheckin, finishCheckin, forceFlake, postMessage, askBot, confirmBotAction,
  proposeCashout, voteCashout, cancelCashout, setPoolGoal, requestWithdrawal, cancelWithdrawal, resetDemoData, setDemoFlags, getDemoFlags,
} from './actions';
export {
  useNow, useConnection, useMe, useAccount, useBilling, useSquad, useSquadMembers, useMyGoals, useGoal, useGoalHistory, useActiveCheckin, useLeaderboard,
  useFeed, usePoolFunders, useOpenCashout, useBotThread, useDemoFlags, useWallet, useWithdrawals,
} from './hooks';

// Charity rule (mock-only for now): the Spacetime module still needs charity_id/pool_full_at columns and procedures.
import type { CashoutProposal, CharityStatus, Donation, Result, Squad } from '../types';
const notLive = <T>(): Promise<Result<T>> => Promise.resolve({ ok: false, error: 'unknown' });
export const setCharity = (_id: string): Promise<Result<Squad>> => notLive();
export const proposeDonation = (): Promise<Result<CashoutProposal>> => notLive();
export const demoExpirePoolDeadline = (): Promise<Result<Squad>> => notLive();
export const useCharityStatus = (): CharityStatus | null => null;
export const useDonations = (): Donation[] => [];
export const getBotContext = (): Record<string, unknown> | null => null; // AI bot context is mock-only for now
