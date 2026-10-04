import {
  buildLeaderboard, deadlinePassed, formatCents, formatCountdown, isDueToday, LIMITS, localDate, msUntilDeadline, nextPenaltyCents,
} from '../logic';
import type { MockState } from './state';
import { squadMembers } from './state';

const ROASTS = [
  'The pool says thanks.',
  'Flakey is melting. Again.',
  'Bold strategy, skipping it.',
  'Your couch sends its regards.',
  'Receipts do not lie.',
  'Promises are free. Flaking is not.',
];
const HYPE: Record<number, string> = {
  3: '3 in a row! Flakey is doing a little dance 🔥',
  5: '5 in a row! Someone is on fire 🔥🔥',
  10: '10 in a row! Legend behavior 🏆',
};
const BROKE = ['Broke AND flaky. Impressive.', 'Zero balance, zero excuses.'];

export const pick = <T>(arr: T[], n: number): T => arr[Math.abs(n) % arr.length];
export const roastLine = (n: number) => pick(ROASTS, n);
export const brokeLine = (n: number) => pick(BROKE, n);
export const hypeLine = (streak: number): string | null => HYPE[streak] ?? null;
export const photoRoast = (n: number) =>
  pick(["That's a couch. Bold strategy.", 'Nice try. That is not the gym.', 'I see a selfie, not a squat rack.', 'Flakey is not fooled.'], n);

export interface BotAnswer { text: string; action?: { label: string; args: { goalId: string; baseCents: number } } }

export const SUGGESTIONS = ["Who's flaking?", 'Pool status', 'Raise my penalty to $10', 'My streak'];

export function answer(s: MockState, userId: string, text: string, now: number): BotAnswer {
  const user = s.users[userId];
  const squad = user?.squadId ? s.squads[user.squadId] : null;
  if (!user || !squad) return { text: 'Join a squad first and I will start judging you.' };
  const t = text.toLowerCase().replace(/@squadbot/g, '').trim();
  const members = squadMembers(s, squad.id);
  const memberIds = new Set(members.map((m) => m.id));
  const myGoals = Object.values(s.goals).filter((g) => g.userId === userId && g.active);

  // actions: "raise my gym penalty to $10"
  if (/(raise|increase|bump|set|change|lower)/.test(t) && /penalt/.test(t)) {
    const m = t.match(/\$?\s*(\d+(?:\.\d{1,2})?)/);
    if (!m) return { text: 'How much? Try "raise my gym penalty to $10".' };
    const cents = Math.round(parseFloat(m[1]) * 100);
    if (myGoals.length === 0) return { text: 'You have no goals yet. Scared?' };
    const goal = myGoals.find((g) => t.includes(g.title.toLowerCase().split(' ')[0])) ?? myGoals[0];
    if (cents < LIMITS.penaltyMin) return { text: 'Minimum penalty is $1. Nice try, though.' };
    if (cents > goal.maxPenaltyCents) return { text: `The cap on ${goal.title} is ${formatCents(goal.maxPenaltyCents)}. I cannot go higher.` };
    return {
      text: `Change the base penalty on "${goal.title}" from ${formatCents(goal.basePenaltyCents)} to ${formatCents(cents)}? Confirm below.`,
      action: { label: `${goal.title}: ${formatCents(goal.basePenaltyCents)} → ${formatCents(cents)}`, args: { goalId: goal.id, baseCents: cents } },
    };
  }
  const board = () => buildLeaderboard(members, Object.values(s.goals).filter((g) => memberIds.has(g.userId)),
    Object.values(s.checkins), Object.values(s.penalties), now, squad.timezone);

  if (/^\s*(hi|hello|hey|help)\W*$|what can you do|help me/.test(t)) {
    return { text: 'Ask me who is flaking, who is winning, what is due today, your balance, how close the pool is, or say raise my penalty to ten dollars.' };
  }
  if (/(balance|my money|how much (do i|have i)|wallet|am i broke|how broke)/.test(t)) {
    const g0 = myGoals[0];
    return {
      text: user.balanceCents <= 0
        ? 'You are at zero. Flaking is now free, which is somehow worse.'
        : `You have ${formatCents(user.balanceCents)}.${g0 ? ` Your next miss on ${g0.title} costs ${formatCents(nextPenaltyCents(g0))}.` : ''}`,
    };
  }
  if (/(winning|leader|champion|first place|best (one|player|member)|\btop\b)/.test(t)) {
    const top = board()[0];
    if (!top) return { text: 'Nobody is on the board yet.' };
    const pct = top.completionRate === null ? '' : ` with ${Math.round(top.completionRate * 100)} percent this week`;
    return { text: `${top.user.name} is on top${pct}${top.streak > 0 ? ` and a ${top.streak} day streak` : ''}. Show-off.` };
  }
  if (/(deadline|\bdue\b|what.?s next|next goal|today|when)/.test(t)) {
    const tz = squad.timezone;
    const today = localDate(now, tz);
    const due = myGoals
      .filter((g) => isDueToday(g, now, tz) && !deadlinePassed(g, now, tz)
        && !Object.values(s.checkins).some((c) => c.goalId === g.id && c.localDate === today && c.status === 'completed'))
      .map((g) => ({ g, ms: msUntilDeadline(g, now, tz) }))
      .sort((a, b) => a.ms - b.ms);
    if (due.length === 0) return { text: 'Nothing is due right now. Enjoy it while it lasts.' };
    return { text: `${due.map((d) => `${d.g.title} is due in ${formatCountdown(d.ms)}`).join('. ')}. Move it.` };
  }
  if (/(flak|worst|who|lazy|skip)/.test(t)) {
    const rows = buildLeaderboard(members, Object.values(s.goals).filter((g) => memberIds.has(g.userId)),
      Object.values(s.checkins), Object.values(s.penalties), now, squad.timezone);
    const worst = rows.find((r) => r.isFlakeOfWeek);
    if (!worst) return { text: 'Nobody has flaked this week. Suspicious. Impressive. Suspicious.' };
    return { text: `${worst.user.name} is the Flake of the Week 🥶 and has paid ${formatCents(worst.totalPaidCents)} so far. The rest of us thank them.` };
  }
  if (/(pool|pizza|close|goal|money|how much)/.test(t)) {
    const left = Math.max(squad.poolGoalCents - squad.poolBalanceCents, 0);
    const funders = Object.values(s.penalties).filter((p) => p.squadId === squad.id).reduce<Record<string, number>>((a, p) => {
      a[p.userId] = (a[p.userId] ?? 0) + p.amountCents; return a;
    }, {});
    const top = Object.entries(funders).sort((a, b) => b[1] - a[1])[0];
    const topName = top ? s.users[top[0]]?.name : null;
    return {
      text: left === 0
        ? `We hit ${formatCents(squad.poolGoalCents)} for ${squad.poolGoalName}! Time to cash out 🍕`
        : `${formatCents(squad.poolBalanceCents)} of ${formatCents(squad.poolGoalCents)} for ${squad.poolGoalName}.` +
          (topName ? ` ${topName} is carrying the team financially 💀` : ' Somebody flake, please.'),
    };
  }
  if (/streak/.test(t)) {
    const best = myGoals.reduce((m, g) => Math.max(m, g.streak), 0);
    const nxt = myGoals[0] ? formatCents(nextPenaltyCents(myGoals[0])) : '$0';
    return { text: best > 0 ? `Your best streak is ${best} 🔥. Next miss costs ${nxt}.` : `No streak right now. Next miss costs ${nxt}. No pressure. (Pressure.)` };
  }
  return { text: 'I can answer who is flaking, who is winning, what is due today, your balance and how close the pool is, and change your penalty. Try a chip below 👇' };
}
