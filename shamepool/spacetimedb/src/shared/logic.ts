// GENERATED COPY of web/src/data/logic.ts. Do not edit; run: node scripts/sync-shared.mjs
import type { Cents, Checkin, ErrorCode, Goal, GoalInput, LeaderboardRow, Penalty, Pos, StakeItem, User } from './types';

export const MAX_ESCALATION_EXPONENT = 10;
export const DEFAULT_TZ = 'America/Detroit';

/* ---------- geo ---------- */
export function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function distanceToGoalM(goal: Pick<Goal, 'lat' | 'lng'>, pos: Pos): number {
  return haversineM(goal, pos);
}

/** Inside radius, tolerating up to 50 m of reported GPS inaccuracy (edge C3). */
export function isInside(goal: Pick<Goal, 'lat' | 'lng' | 'radiusM'>, pos: Pos): boolean {
  const slack = Math.min(Math.max(pos.accuracyM ?? 0, 0), 50);
  return distanceToGoalM(goal, pos) <= goal.radiusM + slack;
}

export function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

/* ---------- money ---------- */
export function nextPenaltyCents(goal: Pick<Goal, 'basePenaltyCents' | 'maxPenaltyCents' | 'consecutiveFlakes'>): Cents {
  const n = Math.min(Math.max(goal.consecutiveFlakes, 0), MAX_ESCALATION_EXPONENT);
  const cap = Math.max(goal.maxPenaltyCents, goal.basePenaltyCents); // edge G5
  return Math.min(goal.basePenaltyCents * 2 ** n, cap);
}

/** Balance never goes negative (edge P2/P3). */
export function applyPenalty(balanceCents: Cents, intendedCents: Cents): { charged: Cents; shortfall: Cents } {
  const charged = Math.min(Math.max(balanceCents, 0), intendedCents);
  return { charged, shortfall: intendedCents - charged };
}

export function formatCents(c: Cents): string {
  const sign = c < 0 ? '-' : '';
  const abs = Math.abs(c);
  const dollars = Math.floor(abs / 100);
  const cents = abs % 100;
  return `${sign}$${dollars}${cents ? '.' + String(cents).padStart(2, '0') : ''}`;
}

/* ---------- time ---------- */
const fmtCache = new Map<string, Intl.DateTimeFormat>();
function parts(ts: number, tz: string) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    });
    fmtCache.set(tz, f);
  }
  const o: Record<string, string> = {};
  for (const p of f.formatToParts(new Date(ts))) o[p.type] = p.value;
  return { y: +o.year, m: +o.month, d: +o.day, h: +o.hour % 24, min: +o.minute };
}

export function localDate(ts: number, tz: string): string {
  const p = parts(ts, tz);
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}
export function localMinutes(ts: number, tz: string): number {
  const p = parts(ts, tz);
  return p.h * 60 + p.min;
}
export function dateAddDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
export function dowOfDate(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
/** Monday of the week containing `date`. */
export function weekStart(date: string): string {
  return dateAddDays(date, -((dowOfDate(date) + 6) % 7));
}
export function isScheduledOn(goal: Pick<Goal, 'daysOfWeek'>, date: string): boolean {
  return goal.daysOfWeek.includes(dowOfDate(date));
}
export function isDueToday(goal: Pick<Goal, 'daysOfWeek' | 'active'>, now: number, tz: string): boolean {
  return goal.active && isScheduledOn(goal, localDate(now, tz));
}
export function deadlinePassed(goal: Pick<Goal, 'deadlineMinutes'>, now: number, tz: string): boolean {
  return localMinutes(now, tz) >= goal.deadlineMinutes;
}
/** Ms until today's deadline from wall-clock minutes (DST-safe: no +24h math). Negative if passed. */
export function msUntilDeadline(goal: Pick<Goal, 'deadlineMinutes'>, now: number, tz: string): number {
  return (goal.deadlineMinutes - localMinutes(now, tz)) * 60_000;
}
export function formatCountdown(ms: number): string {
  if (ms <= 0) return 'Time is up';
  const totalMin = Math.ceil(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
export function formatDeadline(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

/**
 * Dates (ascending, max 7 back) whose deadline already passed and haven't been
 * flake-evaluated. Never retroactive before goal creation (edges G10, P8, P9).
 */
export function missedDates(goal: Goal, now: number, tz: string): string[] {
  if (!goal.active) return [];
  const today = localDate(now, tz);
  const created = localDate(goal.createdAt, tz);
  const createdMin = localMinutes(goal.createdAt, tz);
  let start = dateAddDays(goal.lastEvaluatedDate, 1);
  const floor = dateAddDays(today, -6);
  if (start < floor) start = floor;
  if (start < created) start = created;
  const out: string[] = [];
  for (let d = start; d <= today; d = dateAddDays(d, 1)) {
    if (!isScheduledOn(goal, d)) continue;
    if (d === today && !deadlinePassed(goal, now, tz)) continue;
    if (d === created && createdMin >= goal.deadlineMinutes) continue;
    out.push(d);
  }
  return out;
}

/* ---------- stats ---------- */
export function completionRateThisWeek(goals: Goal[], checkins: Checkin[], now: number, tz: string): number | null {
  const today = localDate(now, tz);
  const ws = weekStart(today);
  let expected = 0;
  let done = 0;
  for (const g of goals) {
    if (!g.active) continue;
    const created = localDate(g.createdAt, tz);
    const createdLate = localMinutes(g.createdAt, tz) >= g.deadlineMinutes;
    for (let d = ws; d <= today; d = dateAddDays(d, 1)) {
      if (d < created || !isScheduledOn(g, d)) continue;
      if (d === created && createdLate) continue; // not retroactive (G10)
      const completed = checkins.some((c) => c.goalId === g.id && c.localDate === d && c.status === 'completed');
      if (completed) { expected++; done++; continue; }
      if (d < today || deadlinePassed(g, now, tz)) expected++;
    }
  }
  return expected === 0 ? null : done / expected;
}

export function buildLeaderboard(
  users: User[], goals: Goal[], checkins: Checkin[], penalties: Penalty[], now: number, tz: string,
): LeaderboardRow[] {
  const ws = weekStart(localDate(now, tz));
  const rows = users.map((user) => {
    const mine = goals.filter((g) => g.userId === user.id && g.active);
    const completionRate = completionRateThisWeek(mine, checkins.filter((c) => c.userId === user.id), now, tz);
    const streak = mine.reduce((m, g) => Math.max(m, g.streak), 0);
    const myPens = penalties.filter((p) => p.userId === user.id && p.status !== 'failed');
    const totalPaidCents = myPens.reduce((s, p) => s + p.amountCents, 0);
    const weekPens = myPens.filter((p) => p.localDate >= ws);
    return {
      user, completionRate, streak, totalPaidCents,
      weekPaid: weekPens.reduce((s, p) => s + p.intendedCents, 0), weekFlakes: weekPens.length,
    };
  });
  rows.sort((a, b) =>
    (b.completionRate ?? 1) - (a.completionRate ?? 1) || b.streak - a.streak ||
    a.totalPaidCents - b.totalPaidCents || a.user.name.localeCompare(b.user.name));
  const worst = rows.filter((r) => r.weekFlakes > 0).sort((a, b) => b.weekPaid - a.weekPaid || b.weekFlakes - a.weekFlakes)[0];
  return rows.map((r, i) => ({
    user: r.user, rank: i + 1, completionRate: r.completionRate, streak: r.streak,
    totalPaidCents: r.totalPaidCents, isFlakeOfWeek: !!worst && worst.user.id === r.user.id,
  }));
}

export const penaltyKey = (goalId: string, date: string) => `${goalId}:${date}`;

/* ---------- validation ---------- */
export const LIMITS = {
  nameMax: 20, titleMax: 40, messageMax: 280, maxGoalsPerUser: 5, maxSquadSize: 8,
  radiusMin: 50, radiusMax: 1000, stayMin: 1, stayMax: 180, penaltyMin: 100, poolMaxCents: 100_000, maxPhotoAttempts: 3,
};

export function validateName(name: string): ErrorCode | null {
  const n = name.trim();
  return n.length < 1 || n.length > LIMITS.nameMax ? 'invalid_name' : null;
}
export function validatePoolGoal(cents: number): ErrorCode | null {
  return !Number.isInteger(cents) || cents <= 0 || cents > LIMITS.poolMaxCents ? 'invalid_amount' : null;
}
export function validateGoalInput(i: GoalInput): ErrorCode | null {
  const t = i.title.trim();
  if (t.length < 1 || t.length > LIMITS.titleMax) return 'invalid_title';
  if (!i.daysOfWeek.length || i.daysOfWeek.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) return 'no_days';
  if (!Number.isFinite(i.lat) || !Number.isFinite(i.lng) || Math.abs(i.lat) > 90 || Math.abs(i.lng) > 180) return 'invalid_location';
  if (!Number.isFinite(i.radiusM) || i.radiusM < LIMITS.radiusMin || i.radiusM > LIMITS.radiusMax) return 'invalid_radius';
  if (!Number.isInteger(i.minStayMinutes) || i.minStayMinutes < LIMITS.stayMin || i.minStayMinutes > LIMITS.stayMax) return 'invalid_stay';
  if (!Number.isInteger(i.deadlineMinutes) || i.deadlineMinutes < 0 || i.deadlineMinutes > 1439) return 'invalid_stay';
  if (!Number.isInteger(i.basePenaltyCents) || !Number.isInteger(i.maxPenaltyCents)) return 'invalid_penalty';
  if (i.basePenaltyCents < LIMITS.penaltyMin || i.basePenaltyCents > i.maxPenaltyCents) return 'invalid_penalty';
  return null;
}

export function normalizeInviteCode(s: string): string {
  return s.replace(/\s+/g, '').toUpperCase();
}
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function generateInviteCode(rng: () => number = Math.random): string {
  let s = '';
  for (let i = 0; i < 6; i++) s += CODE_CHARS[Math.floor(rng() * CODE_CHARS.length)];
  return s;
}

/* ---------- plan goal limits ---------- */
/** Active goals each plan allows. Enforced by the data layer (mock and Spacetime), not only by the screens. */
export const GOAL_LIMITS = { free: 1, paid: 5 } as const;
export const goalLimit = (tier: string | null | undefined): number => (tier === 'paid' ? GOAL_LIMITS.paid : GOAL_LIMITS.free);
/**
 * Which active goals to pause so a user fits their plan: everything beyond the limit, newest first (the oldest goals,
 * the ones with history, are kept).
 */
export function goalsOverLimit<T extends { id: string; createdAt: number; active: boolean }>(goals: T[], limit: number): T[] {
  const active = goals.filter((g) => g.active).sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  return active.slice(limit);
}

/* ---------- squad ownership / kicking ---------- */
/** Who started a squad, read from its "started the squad" feed event (for squads created before the owner was stored). */
export function ownerFromFeed(feed: { kind: string; text: string; actorUserId: string | null; createdAt: number }[]): string | null {
  const starts = feed.filter((f) => f.kind === 'commit' && !!f.actorUserId && f.text.includes(' started the squad '))
    .sort((a, b) => a.createdAt - b.createdAt);
  return starts[0]?.actorUserId ?? null;
}
/** Key of the "removed from this squad" ban: a kicked member cannot rejoin with the same public invite code. */
export const banKey = (squadId: string, userId: string): string => `${squadId}:${userId}`;
/** Kick rules: only the squad's owner, only a current member of the same squad, never yourself. */
export function kickError(
  me: { id: string; squadId: string | null } | null | undefined, ownerId: string | null, target: { id: string; squadId: string | null } | null | undefined,
): ErrorCode | null {
  if (!me) return 'no_user';
  if (!me.squadId) return 'not_in_squad';
  if (ownerId !== me.id) return 'not_owner';
  if (target?.id === me.id) return 'cannot_kick_self';
  if (!target || target.squadId !== me.squadId) return 'member_not_found';
  return null;
}

/* ---------- wallet / withdrawals ---------- */
export const MIN_WITHDRAW_CENTS = 500;
export const STAKE_LOOKAHEAD_DAYS = 3;
export const WITHDRAW_COOLDOWN_REAL_MS = 24 * 3600_000;
export const WITHDRAW_COOLDOWN_DEMO_MS = 20_000;

/**
 * Check-ins still ahead in the next 3 days (rolling). Today counts while it is scheduled and not handled
 * (checked in or already flaked), EVEN after its deadline: until the scheduler charges the flake the money is still owed.
 */
export function upcomingOccurrences(
  goal: Pick<Goal, 'daysOfWeek' | 'deadlineMinutes' | 'active'>, now: number, tz: string, todayHandled: boolean,
): number {
  if (!goal.active) return 0;
  const today = localDate(now, tz);
  let n = 0;
  for (let i = 0; i < STAKE_LOOKAHEAD_DAYS; i++) {
    const d = dateAddDays(today, i);
    if (!isScheduledOn(goal, d)) continue;
    if (i === 0 && todayHandled) continue;
    n++;
  }
  return n;
}

/** Sum of escalating penalties if every one of `occurrences` is flaked. */
export function worstCaseExposureCents(
  goal: Pick<Goal, 'basePenaltyCents' | 'maxPenaltyCents' | 'consecutiveFlakes'>, occurrences: number,
): Cents {
  let sum = 0;
  for (let i = 0; i < occurrences; i++) sum += nextPenaltyCents({ ...goal, consecutiveFlakes: goal.consecutiveFlakes + i });
  return sum;
}

export function stakeBreakdown(
  goals: Goal[], now: number, tz: string, handledToday: (goalId: string) => boolean,
): StakeItem[] {
  return goals.filter((g) => g.active).map((g) => {
    const occurrences = upcomingOccurrences(g, now, tz, handledToday(g.id));
    return { goalId: g.id, title: g.title, emoji: g.emoji, occurrences, cents: worstCaseExposureCents(g, occurrences) };
  }).filter((s) => s.occurrences > 0);
}

export function availableToWithdraw(balanceCents: Cents, stakeCents: Cents): Cents {
  return Math.max(0, balanceCents - stakeCents);
}

export function validateWithdrawal(amountCents: number, availableCents: Cents): ErrorCode | null {
  if (!Number.isInteger(amountCents) || amountCents <= 0) return 'invalid_amount';
  if (amountCents < MIN_WITHDRAW_CENTS) return 'below_minimum';
  if (amountCents > availableCents) return 'insufficient_available';
  return null;
}
