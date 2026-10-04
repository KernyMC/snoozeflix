import { beforeEach, describe, expect, it } from 'vitest';
import { upcomingOccurrences, worstCaseExposureCents } from '../logic';
import * as E from './engine';
import { makeSeed } from './seed';
import type { Ctx, MockState } from './state';

// Wed 2026-10-07 12:00 America/Detroit
const NOON = new Date('2026-10-07T12:00:00-04:00').getTime();
const K = 'seed_kevin';
let s: MockState;
const ctx = (userId: string | null = K, now = NOON): Ctx => ({ s, now, userId });
beforeEach(() => { s = makeSeed(NOON); });

describe('stake math', () => {
  const g = { daysOfWeek: [0, 1, 2, 3, 4, 5, 6], deadlineMinutes: 18 * 60, active: true };
  it('counts 3 rolling days, today only before the deadline', () => {
    expect(upcomingOccurrences(g, NOON, 'America/Detroit', false)).toBe(3);
    expect(upcomingOccurrences(g, NOON, 'America/Detroit', true)).toBe(2); // today already done
    const late = new Date('2026-10-07T19:00:00-04:00').getTime();
    expect(upcomingOccurrences(g, late, 'America/Detroit', false)).toBe(2);
    expect(upcomingOccurrences({ ...g, active: false }, NOON, 'America/Detroit', false)).toBe(0);
  });
  it('rolling window: Sunday night still has days ahead (never zero)', () => {
    const sunNight = new Date('2026-10-11T23:00:00-04:00').getTime();
    expect(upcomingOccurrences(g, sunNight, 'America/Detroit', false)).toBe(2);
  });
  it('worst case escalates then caps', () => {
    const goal = { basePenaltyCents: 500, maxPenaltyCents: 4000, consecutiveFlakes: 0 };
    expect(worstCaseExposureCents(goal, 4)).toBe(500 + 1000 + 2000 + 4000);
    expect(worstCaseExposureCents(goal, 6)).toBe(500 + 1000 + 2000 + 4000 + 4000 + 4000);
    expect(worstCaseExposureCents(goal, 0)).toBe(0);
  });
});

describe('wallet', () => {
  it('available = balance - stake and never negative', () => {
    const w = E.walletFor(s, K, NOON);
    expect(w.stakeCents).toBeGreaterThan(0);
    expect(w.availableCents).toBe(Math.max(0, w.balanceCents - w.stakeCents));
    s.users[K].balanceCents = 100;
    expect(E.walletFor(s, K, NOON).availableCents).toBe(0); // W10
  });
  it('a user with no goals can withdraw everything', () => {
    const w = E.walletFor(s, 'seed_leo', NOON);
    expect(w.stakeCents).toBeGreaterThan(0);
    for (const g of Object.values(s.goals)) if (g.userId === 'seed_leo') g.active = false;
    const w2 = E.walletFor(s, 'seed_leo', NOON);
    expect(w2.stakeCents).toBe(0);
    expect(w2.availableCents).toBe(w2.balanceCents);
  });
});

describe('withdrawals', () => {
  it('validates amounts (W1-W3)', () => {
    expect(E.requestWithdrawal(ctx(), 0)).toMatchObject({ ok: false, error: 'invalid_amount' });
    expect(E.requestWithdrawal(ctx(), 10.5)).toMatchObject({ ok: false, error: 'invalid_amount' });
    expect(E.requestWithdrawal(ctx(), 499)).toMatchObject({ ok: false, error: 'below_minimum' });
    const r = E.requestWithdrawal(ctx(), 10_000_000);
    expect(r).toMatchObject({ ok: false, error: 'insufficient_available' });
    expect(!r.ok && typeof r.meta?.availableCents).toBe('number');
  });
  it('moves money to escrow, one pending at a time (W4/W13)', () => {
    const before = s.users[K].balanceCents;
    const r = E.requestWithdrawal(ctx(), 1000);
    expect(r.ok).toBe(true);
    expect(s.users[K].balanceCents).toBe(before - 1000);
    expect(E.requestWithdrawal(ctx(), 1000)).toMatchObject({ ok: false, error: 'withdrawal_pending' });
    expect(s.feed[0].kind).toBe('withdrawal');
  });
  it('cancel returns the money, is idempotent and owner-only (W5/W7)', () => {
    const before = s.users[K].balanceCents;
    const r = E.requestWithdrawal(ctx(), 1000);
    const id = r.ok ? r.data.id : '';
    expect(E.cancelWithdrawal(ctx('seed_ana'), id)).toMatchObject({ ok: false, error: 'withdrawal_not_found' });
    expect(E.cancelWithdrawal(ctx(), id).ok).toBe(true);
    expect(s.users[K].balanceCents).toBe(before);
    expect(E.cancelWithdrawal(ctx(), id)).toMatchObject({ ok: false, error: 'withdrawal_not_found' });
    expect(E.requestWithdrawal(ctx(), 1000).ok).toBe(true); // can request again
  });
  it('completes after the cooling period, not before (W8)', () => {
    const r = E.requestWithdrawal(ctx(), 1000);
    const w = r.ok ? r.data : (null as never);
    expect(E.settleWithdrawals(ctx(null, w.availableAt - 1))).toBe(0);
    expect(s.withdrawals[w.id].status).toBe('pending');
    expect(E.settleWithdrawals(ctx(null, w.availableAt))).toBe(1);
    expect(s.withdrawals[w.id].status).toBe('completed');
    expect(E.settleWithdrawals(ctx(null, w.availableAt + 1000))).toBe(0);
    expect(E.cancelWithdrawal(ctx(), w.id)).toMatchObject({ ok: false });
  });
  it('flake during cooling is still covered by the stake (W6)', () => {
    const w = E.walletFor(s, K, NOON);
    const r = E.requestWithdrawal(ctx(), w.availableCents);
    expect(r.ok).toBe(true);
    const penalized = E.forceFlake(ctx(), 'seed_goal_0');
    expect(penalized.ok && penalized.data.shortfallCents).toBe(0);
    expect(s.users[K].balanceCents).toBeGreaterThanOrEqual(0);
  });
  it('flake-and-run is impossible: after withdrawing max, the whole worst case is still payable', () => {
    const w = E.walletFor(s, K, NOON);
    E.requestWithdrawal(ctx(), w.availableCents);
    let shortfall = 0;
    for (const g of Object.values(s.goals).filter((x) => x.userId === K)) {
      const p = E.forceFlake(ctx(), g.id);
      if (p.ok) shortfall += p.data.shortfallCents;
    }
    expect(shortfall).toBe(0);
  });
  it('needs a squad (W9)', () => {
    const u = E.registerUser(ctx(null), { name: 'Solo', avatar: 'x' });
    expect(E.requestWithdrawal(ctx(u.ok ? u.data.id : null), 1000)).toMatchObject({ ok: false, error: 'not_in_squad' });
  });
  it('pool is untouched by withdrawals', () => {
    const pool = s.squads.squad_mhacks.poolBalanceCents;
    E.requestWithdrawal(ctx(), 1000);
    expect(s.squads.squad_mhacks.poolBalanceCents).toBe(pool);
  });
});
