import { deadlinePassed, formatCents, formatCountdown, formatDeadline, isDueToday, localDate, msUntilDeadline, nextPenaltyCents, penaltyKey } from '../logic';
import { charityById } from '../charities';
import { charityStatusFor, leaderboardFor, openProposal, walletFor } from './engine';
import type { MockState } from './state';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * A compact, readable snapshot of what the signed-in user can see, sent to the AI bot as context.
 * Amounts are formatted strings so the model quotes them exactly. Kept small (a few KB).
 */
export function buildBotContext(s: MockState, userId: string, now: number): Record<string, unknown> | null {
  const me = s.users[userId];
  const squad = me?.squadId ? s.squads[me.squadId] : null;
  if (!me || !squad) return null;
  const tz = squad.timezone;
  const today = localDate(now, tz);
  const wallet = walletFor(s, me.id, now);
  const charity = charityStatusFor(squad);
  const open = openProposal(s, squad.id);

  const goals = Object.values(s.goals).filter((g) => g.userId === me.id && g.active).map((g) => {
    const done = Object.values(s.checkins).some((c) => c.goalId === g.id && c.localDate === today && c.status === 'completed');
    const flaked = !!s.penalties[penaltyKey(g.id, today)];
    const scheduled = isDueToday(g, now, tz);
    const passed = deadlinePassed(g, now, tz);
    const state = done ? 'done today' : flaked ? 'flaked today' : scheduled && passed ? 'late' : scheduled ? 'due today' : 'rest day';
    return {
      title: g.title, state, streak: g.streak, nextMissCosts: formatCents(nextPenaltyCents(g)),
      deadline: formatDeadline(g.deadlineMinutes), days: g.daysOfWeek.map((d) => DAY_NAMES[d]).join(' '),
      ...(state === 'due today' ? { dueIn: formatCountdown(msUntilDeadline(g, now, tz)) } : {}),
    };
  });

  return {
    today: `${today} (${DAY_NAMES[new Date(`${today}T12:00:00Z`).getUTCDay()]})`,
    me: { name: me.name, balance: formatCents(me.balanceCents), canWithdraw: formatCents(wallet.availableCents), lockedAsStake: formatCents(wallet.stakeCents) },
    squad: {
      name: squad.name, pool: formatCents(squad.poolBalanceCents), poolGoal: formatCents(squad.poolGoalCents), poolGoalName: squad.poolGoalName,
      charity: charityById(charity.charityId).name,
      ...(charity.deadlineAt ? { poolFullAutoDonatesIn: formatCountdown(charity.deadlineAt - now) } : {}),
    },
    leaderboard: leaderboardFor(s, squad.id, now).map((r) => ({
      rank: r.rank, name: r.user.name, weekCompletion: r.completionRate === null ? 'n/a' : `${Math.round(r.completionRate * 100)}%`,
      streak: r.streak, totalPaid: formatCents(r.totalPaidCents), ...(r.isFlakeOfWeek ? { flakeOfTheWeek: true } : {}),
    })),
    myGoals: goals,
    recentFeed: s.feed.filter((f) => f.squadId === squad.id).slice(0, 6).map((f) => f.text.slice(0, 140)),
    openVote: open ? `${open.kind === 'donate' ? 'donate to' : 'spend at'} ${open.merchantName} for ${formatCents(open.amountCents)}, ${Object.values(open.votes).filter(Boolean).length} yes so far` : null,
  };
}
