// Live twin of mock/botContext.ts: a compact snapshot of what the signed-in user can see, sent to the AI bot route.
// Built from the rows this tab already mirrors from Spacetime. Amounts are formatted strings so the model quotes them.
import {
  availableToWithdraw, buildLeaderboard, DEFAULT_TZ, deadlinePassed, formatCents, formatCountdown, formatDeadline, isDueToday, localDate,
  msUntilDeadline, nextPenaltyCents, penaltyKey, stakeBreakdown,
} from '../logic';
import { checkinOf, goalOf, penaltyOf, userOf } from './mappers';
import type { LiveState } from './stdb';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function buildLiveBotContext(s: LiveState, now: number): Record<string, unknown> | null {
  const me = s.me;
  const squad = me?.squadId ? s.squads.find((q) => q.id === me.squadId) : undefined;
  if (!me || !squad) return null;
  const tz = squad.timezone || DEFAULT_TZ;
  const today = localDate(now, tz);
  const members = s.users.filter((u) => u.squadId === squad.id);
  const ids = new Set(members.map((m) => m.id));
  const doneToday = (goalId: string) => s.checkins.some((c) => c.goalId === goalId && c.localDate === today && c.status === 'completed');
  const flakedToday = (goalId: string) => s.penalties.some((p) => p.key === penaltyKey(goalId, today));

  const mine = s.goals.filter((g) => g.userId === me.id && g.active).map(goalOf);
  const stake = stakeBreakdown(mine, now, tz, (id) => doneToday(id) || flakedToday(id));
  const stakeCents = stake.reduce((a, x) => a + x.cents, 0);
  const goals = mine.map((g) => {
    const done = doneToday(g.id);
    const flaked = flakedToday(g.id);
    const scheduled = isDueToday(g, now, tz);
    const passed = deadlinePassed(g, now, tz);
    const state = done ? 'done today' : flaked ? 'flaked today' : scheduled && passed ? 'late' : scheduled ? 'due today' : 'rest day';
    return {
      title: g.title, state, streak: g.streak, nextMissCosts: formatCents(nextPenaltyCents(g)),
      deadline: formatDeadline(g.deadlineMinutes), days: g.daysOfWeek.map((d) => DAY_NAMES[d]).join(' '),
      ...(state === 'due today' ? { dueIn: formatCountdown(msUntilDeadline(g, now, tz)) } : {}),
    };
  });

  const board = buildLeaderboard(
    members.map(userOf), s.goals.filter((g) => ids.has(g.userId)).map(goalOf), s.checkins.filter((c) => ids.has(c.userId)).map(checkinOf),
    s.penalties.filter((p) => p.squadId === squad.id).map(penaltyOf), now, tz,
  );
  const open = s.cashouts.find((c) => c.squadId === squad.id && c.status === 'open');
  const yes = open ? s.votes.filter((v) => v.proposalId === open.id && v.approve).length : 0;

  return {
    today: `${today} (${DAY_NAMES[new Date(`${today}T12:00:00Z`).getUTCDay()]})`,
    me: {
      name: me.name, balance: formatCents(me.balanceCents), canWithdraw: formatCents(availableToWithdraw(me.balanceCents, stakeCents)),
      lockedAsStake: formatCents(stakeCents),
    },
    squad: {
      name: squad.name, pool: formatCents(squad.poolBalanceCents), poolGoal: formatCents(squad.poolGoalCents), poolGoalName: squad.poolGoalName,
      members: members.length,
    },
    leaderboard: board.map((r) => ({
      rank: r.rank, name: r.user.name, weekCompletion: r.completionRate === null ? 'n/a' : `${Math.round(r.completionRate * 100)}%`,
      streak: r.streak, totalPaid: formatCents(r.totalPaidCents), ...(r.isFlakeOfWeek ? { flakeOfTheWeek: true } : {}),
    })),
    myGoals: goals,
    recentFeed: s.feed.filter((f) => f.squadId === squad.id).sort((a, b) => b.createdAt - a.createdAt || b.seq - a.seq).slice(0, 6)
      .map((f) => f.text.slice(0, 140)),
    openVote: open ? `spend at ${open.merchantName} for ${formatCents(open.amountCents)}, ${yes} yes so far` : null,
  };
}
