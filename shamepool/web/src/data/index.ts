// The ONLY module the UI imports. Mode is fixed per build via NEXT_PUBLIC_DATA_MODE.
import * as live from './live';
import * as mock from './mock';

export * from './types';
export {
  SECURITY_QUESTIONS, validateFirstName, validateLastName, validateEmail, validateUsername, validatePassword, validateConfirm,
  validateSecurity, passwordStrength, normalizeAnswer,
} from './authLogic';
export {
  buildLeaderboard, formatCents, formatCountdown, formatDeadline, formatDistance, haversineM, isInside, localDate, LIMITS,
  msUntilDeadline, nextPenaltyCents, deadlinePassed, isDueToday, localMinutes, MIN_WITHDRAW_CENTS,
} from './logic';

const impl = process.env.NEXT_PUBLIC_DATA_MODE === 'live' ? live : mock;

export const startBackend = impl.startBackend;
export const useNow = impl.useNow;
export const useConnection = impl.useConnection;
export const useMe = impl.useMe;
export const useSquad = impl.useSquad;
export const useSquadMembers = impl.useSquadMembers;
export const useMyGoals = impl.useMyGoals;
export const useGoal = impl.useGoal;
export const useGoalHistory = impl.useGoalHistory;
export const useActiveCheckin = impl.useActiveCheckin;
export const useLeaderboard = impl.useLeaderboard;
export const useFeed = impl.useFeed;
export const usePoolFunders = impl.usePoolFunders;
export const useOpenCashout = impl.useOpenCashout;
export const useBotThread = impl.useBotThread;
export const useDemoFlags = impl.useDemoFlags;

export const registerUser = impl.registerUser;
export const registerAccount = impl.registerAccount;
export const login = impl.login;
export const logout = impl.logout;
export const requestWithdrawal = impl.requestWithdrawal;
export const cancelWithdrawal = impl.cancelWithdrawal;
export const useWallet = impl.useWallet;
export const useWithdrawals = impl.useWithdrawals;
export const getSecurityQuestions = impl.getSecurityQuestions;
export const verifySecurityAnswers = impl.verifySecurityAnswers;
export const resetPassword = impl.resetPassword;
export const claimSeedUser = impl.claimSeedUser;
export const listSeedUsers = impl.listSeedUsers;
export const createSquad = impl.createSquad;
export const joinSquad = impl.joinSquad;
export const createGoal = impl.createGoal;
export const updateGoalPenalty = impl.updateGoalPenalty;
export const startCheckin = impl.startCheckin;
export const pingCheckin = impl.pingCheckin;
export const finishCheckin = impl.finishCheckin;
export const forceFlake = impl.forceFlake;
export const postMessage = impl.postMessage;
export const askBot = impl.askBot;
export const confirmBotAction = impl.confirmBotAction;
export const proposeCashout = impl.proposeCashout;
export const voteCashout = impl.voteCashout;
export const cancelCashout = impl.cancelCashout;
export const setPoolGoal = impl.setPoolGoal;
export const resetDemoData = impl.resetDemoData;
export const setDemoFlags = impl.setDemoFlags;
export const getDemoFlags = impl.getDemoFlags;
