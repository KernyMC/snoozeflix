import { describe, expect, it } from 'vitest';
import {
  applyPenalty, buildLeaderboard, completionRateThisWeek, dateAddDays, deadlinePassed, formatCents, formatDistance,
  haversineM, isInside, localDate, localMinutes, missedDates, nextPenaltyCents, normalizeInviteCode, penaltyKey,
  validateGoalInput, weekStart,
} from './logic';
import type { Checkin, Goal, Penalty, User } from './types';

const TZ = 'America/Detroit';
// 2026-10-07 is a Wednesday. 12:00 local (EDT, UTC-4) = 16:00Z
const at = (date: string, h: number, m = 0) => new Date(`${date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00-04:00`).getTime();

const goal = (o: Partial<Goal> = {}): Goal => ({
  id: 'g1', userId: 'u1', squadId: 's1', title: 'Gym', emoji: '🏋️', lat: 42.2808, lng: -83.743, radiusM: 100,
  daysOfWeek: [0, 1, 2, 3, 4, 5, 6], deadlineMinutes: 18 * 60, minStayMinutes: 30,
  basePenaltyCents: 500, maxPenaltyCents: 4000, consecutiveFlakes: 0, streak: 0, active: true,
  createdAt: at('2026-09-01', 9), lastEvaluatedDate: '2026-10-04', ...o,
});

describe('geo', () => {
  it('haversine ~111 km per degree lat', () => {
    expect(haversineM({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeGreaterThan(110_000);
    expect(haversineM({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeLessThan(112_000);
  });
  it('isInside honors radius and bounded accuracy slack', () => {
    const g = goal();
    expect(isInside(g, { lat: g.lat, lng: g.lng })).toBe(true);
    const off = { lat: g.lat + 0.0012, lng: g.lng }; // ~133 m
    expect(isInside(g, off)).toBe(false);
    expect(isInside(g, { ...off, accuracyM: 40 })).toBe(true);
    expect(isInside(g, { ...off, accuracyM: 5000 })).toBe(true); // slack capped at 50 → 150 >= 133
    expect(isInside(g, { lat: g.lat + 0.003, lng: g.lng, accuracyM: 5000 })).toBe(false);
  });
  it('formats distance', () => {
    expect(formatDistance(850)).toBe('850 m');
    expect(formatDistance(1234)).toBe('1.2 km');
  });
});

describe('penalties', () => {
  it('doubles per consecutive flake and caps', () => {
    expect(nextPenaltyCents(goal({ consecutiveFlakes: 0 }))).toBe(500);
    expect(nextPenaltyCents(goal({ consecutiveFlakes: 1 }))).toBe(1000);
    expect(nextPenaltyCents(goal({ consecutiveFlakes: 3 }))).toBe(4000);
    expect(nextPenaltyCents(goal({ consecutiveFlakes: 50 }))).toBe(4000);
  });
  it('cap below base falls back to base (G5)', () => {
    expect(nextPenaltyCents(goal({ basePenaltyCents: 1000, maxPenaltyCents: 500 }))).toBe(1000);
  });
  it('balance floor (P2/P3)', () => {
    expect(applyPenalty(20000, 1000)).toEqual({ charged: 1000, shortfall: 0 });
    expect(applyPenalty(300, 1000)).toEqual({ charged: 300, shortfall: 700 });
    expect(applyPenalty(0, 1000)).toEqual({ charged: 0, shortfall: 1000 });
    expect(applyPenalty(-5, 1000)).toEqual({ charged: 0, shortfall: 1000 });
  });
  it('formats cents', () => {
    expect(formatCents(1000)).toBe('$10');
    expect(formatCents(1050)).toBe('$10.50');
    expect(formatCents(5)).toBe('$0.05');
  });
  it('penaltyKey is stable', () => expect(penaltyKey('g', '2026-10-07')).toBe('g:2026-10-07'));
});

describe('time', () => {
  it('localDate / localMinutes respect timezone', () => {
    const ts = Date.UTC(2026, 9, 8, 2, 30); // Oct 7 22:30 in Detroit
    expect(localDate(ts, TZ)).toBe('2026-10-07');
    expect(localMinutes(ts, TZ)).toBe(22 * 60 + 30);
  });
  it('DST day: wall clock deadline stays 18:00 local (T2)', () => {
    // Fall back 2026-11-01 in Detroit; 18:00 EST = 23:00Z
    const ts = Date.UTC(2026, 10, 1, 23, 0);
    expect(localMinutes(ts, TZ)).toBe(18 * 60);
    expect(deadlinePassed(goal(), ts, TZ)).toBe(true);
    expect(deadlinePassed(goal(), ts - 60_000, TZ)).toBe(false);
  });
  it('week starts Monday', () => {
    expect(weekStart('2026-10-07')).toBe('2026-10-05');
    expect(weekStart('2026-10-11')).toBe('2026-10-05'); // Sunday
    expect(dateAddDays('2026-10-31', 1)).toBe('2026-11-01');
  });
});

describe('missedDates', () => {
  it('none before deadline today', () => {
    expect(missedDates(goal({ lastEvaluatedDate: '2026-10-06' }), at('2026-10-07', 12), TZ)).toEqual([]);
  });
  it('today after deadline', () => {
    expect(missedDates(goal({ lastEvaluatedDate: '2026-10-06' }), at('2026-10-07', 19), TZ)).toEqual(['2026-10-07']);
  });
  it('catches up several dates in order (P8/P9)', () => {
    expect(missedDates(goal({ lastEvaluatedDate: '2026-10-04' }), at('2026-10-07', 19), TZ))
      .toEqual(['2026-10-05', '2026-10-06', '2026-10-07']);
  });
  it('caps at 7 days back', () => {
    expect(missedDates(goal({ lastEvaluatedDate: '2026-01-01' }), at('2026-10-07', 19), TZ)).toHaveLength(7);
  });
  it('only scheduled days (P7)', () => {
    const g = goal({ daysOfWeek: [1], lastEvaluatedDate: '2026-10-01' }); // Mondays
    expect(missedDates(g, at('2026-10-07', 19), TZ)).toEqual(['2026-10-05']);
  });
  it('not retroactive when created after deadline (G10)', () => {
    const g = goal({ createdAt: at('2026-10-07', 20), lastEvaluatedDate: '2026-10-06' });
    expect(missedDates(g, at('2026-10-07', 21), TZ)).toEqual([]);
  });
  it('created before deadline same day is due (G11)', () => {
    const g = goal({ createdAt: at('2026-10-07', 9), lastEvaluatedDate: '2026-10-06' });
    expect(missedDates(g, at('2026-10-07', 19), TZ)).toEqual(['2026-10-07']);
  });
  it('inactive goals never flake (P10)', () => {
    expect(missedDates(goal({ active: false, lastEvaluatedDate: '2026-10-01' }), at('2026-10-07', 19), TZ)).toEqual([]);
  });
});

const ci = (o: Partial<Checkin>): Checkin => ({
  id: Math.random().toString(), goalId: 'g1', userId: 'u1', localDate: '2026-10-05', status: 'completed',
  startedAt: 0, lastDistanceM: 0, lastPingAt: 0, attempts: 1, ...o,
});

describe('completion rate', () => {
  it('null when nothing expected yet (T6)', () => {
    const g = goal({ createdAt: at('2026-10-07', 20), daysOfWeek: [3] });
    expect(completionRateThisWeek([g], [], at('2026-10-07', 21), TZ)).toBeNull();
  });
  it('counts completed vs passed days', () => {
    const g = goal();
    const cs = [ci({ localDate: '2026-10-05' }), ci({ localDate: '2026-10-06', status: 'failed' })];
    // Mon done, Tue missed, Wed (today 12:00) not yet due → 1/2
    expect(completionRateThisWeek([g], cs, at('2026-10-07', 12), TZ)).toBe(0.5);
  });
  it('today counts once completed even before deadline', () => {
    const g = goal();
    const cs = [ci({ localDate: '2026-10-05' }), ci({ localDate: '2026-10-06' }), ci({ localDate: '2026-10-07' })];
    expect(completionRateThisWeek([g], cs, at('2026-10-07', 12), TZ)).toBe(1);
  });
});

describe('leaderboard', () => {
  const users: User[] = ['a', 'b', 'c'].map((id) => ({ id, name: id.toUpperCase(), avatar: '🙂', squadId: 's1', balanceCents: 20000 }));
  const goals = users.map((u) => goal({ id: 'g' + u.id, userId: u.id, streak: u.id === 'a' ? 5 : 0 }));
  const pen = (u: string, d: string, cents: number): Penalty => ({
    id: u + d, goalId: 'g' + u, userId: u, squadId: 's1', localDate: d, amountCents: cents, intendedCents: cents,
    shortfallCents: 0, status: 'charged', createdAt: 0,
  });
  it('ranks by completion then streak, flags flake of the week', () => {
    const checkins = [
      ci({ goalId: 'ga', userId: 'a', localDate: '2026-10-05' }), ci({ goalId: 'ga', userId: 'a', localDate: '2026-10-06' }),
      ci({ goalId: 'gb', userId: 'b', localDate: '2026-10-05' }),
    ];
    const rows = buildLeaderboard(users, goals, checkins, [pen('c', '2026-10-06', 1000), pen('b', '2026-10-06', 500)], at('2026-10-07', 12), TZ);
    expect(rows.map((r) => r.user.id)).toEqual(['a', 'b', 'c']);
    expect(rows.find((r) => r.isFlakeOfWeek)?.user.id).toBe('c');
    expect(rows.filter((r) => r.isFlakeOfWeek)).toHaveLength(1);
  });
  it('no flake of the week without penalties', () => {
    const rows = buildLeaderboard(users, goals, [], [], at('2026-10-07', 12), TZ);
    expect(rows.some((r) => r.isFlakeOfWeek)).toBe(false);
  });
});

describe('validation', () => {
  const base = { title: 'Gym', emoji: '🏋️', lat: 42, lng: -83, radiusM: 100, daysOfWeek: [1], deadlineMinutes: 600, minStayMinutes: 30, basePenaltyCents: 500, maxPenaltyCents: 4000 };
  it('accepts a valid goal', () => expect(validateGoalInput(base)).toBeNull());
  it('rejects bad input', () => {
    expect(validateGoalInput({ ...base, title: '  ' })).toBe('invalid_title');
    expect(validateGoalInput({ ...base, title: 'x'.repeat(41) })).toBe('invalid_title');
    expect(validateGoalInput({ ...base, daysOfWeek: [] })).toBe('no_days');
    expect(validateGoalInput({ ...base, lat: NaN })).toBe('invalid_location');
    expect(validateGoalInput({ ...base, lat: 91 })).toBe('invalid_location');
    expect(validateGoalInput({ ...base, radiusM: 10 })).toBe('invalid_radius');
    expect(validateGoalInput({ ...base, minStayMinutes: 0 })).toBe('invalid_stay');
    expect(validateGoalInput({ ...base, basePenaltyCents: 5.5 })).toBe('invalid_penalty');
    expect(validateGoalInput({ ...base, basePenaltyCents: 5000 })).toBe('invalid_penalty');
  });
  it('normalizes invite codes (E2)', () => expect(normalizeInviteCode(' pi zza6 ')).toBe('PIZZA6'));
});
