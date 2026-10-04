// Live data layer: Spacetime (Maincloud) holds all state and rules; money moves through the outbox + Nessie bridge.
// Exports exactly the names of ../mock so ../index.ts can switch on NEXT_PUBLIC_DATA_MODE.
export {
  startBackend, registerUser, registerAccount, login, logout, getSecurityQuestions, verifySecurityAnswers, resetPassword, claimSeedUser, listSeedUsers,
  updateAvatar, updateAccountName, changeEmail, changePassword, updateSecurity, setPlanTier, addPaymentMethod, removePaymentMethod, addAddress, removeAddress,
  createSquad, joinSquad, kickMember, createGoal, updateGoalPenalty, startCheckin, pingCheckin, finishCheckin, forceFlake, postMessage, askBot, confirmBotAction,
  proposeCashout, voteCashout, cancelCashout, setPoolGoal, requestWithdrawal, cancelWithdrawal, resetDemoData, setDemoFlags, getDemoFlags,
  getBotContext, setCharity, proposeDonation, demoExpirePoolDeadline,
} from './actions';
export {
  useNow, useConnection, useMe, useAccount, useBilling, useSquad, useSquadMembers, useMyGoals, useGoal, useGoalHistory, useActiveCheckin, useLeaderboard,
  useFeed, usePoolFunders, useOpenCashout, useBotThread, useDemoFlags, useWallet, useWithdrawals, useCharityStatus, useDonations,
} from './hooks';

