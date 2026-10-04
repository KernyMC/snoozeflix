import { beforeEach, describe, expect, it } from 'vitest';
import * as E from './engine';
import { makeSeed } from './seed';
import type { Ctx, MockState } from './state';

const NOON = new Date('2026-10-07T12:00:00-04:00').getTime();
const DAY = 86_400_000;
const WINDOW = 7 * DAY; // real window (tests run without NEXT_PUBLIC_DEMO)
let s: MockState;
const ctx = (userId: string | null = 'seed_kevin', now = NOON): Ctx => ({ s, now, userId });
const sq = () => s.squads.squad_mhacks;

/** Fill the pool so it reaches its goal (6000) the normal way: through a flake. */
function fillPool(now = NOON) {
  sq().poolBalanceCents = 5500;
  E.forceFlake(ctx('seed_kevin', now), 'seed_goal_0'); // Kevin: $10 → pool 6500
}

beforeEach(() => { s = makeSeed(NOON, 'weekly'); });

describe('cash-out clock', () => {
  it('is off while the pool is below its goal', () => {
    expect(sq().poolFullAt).toBeNull();
    expect(E.charityStatusFor(sq()).deadlineAt).toBeNull();
  });
  it('starts when a flake fills the pool, with the real 7 day window', () => {
    fillPool();
    expect(sq().poolBalanceCents).toBeGreaterThanOrEqual(6000);
    expect(sq().poolFullAt).toBe(NOON);
    expect(E.charityStatusFor(sq()).deadlineAt).toBe(NOON + WINDOW);
  });
  it('does not restart on later flakes', () => {
    fillPool();
    E.forceFlake(ctx('seed_ana', NOON + 1000), 'seed_goal_2');
    expect(sq().poolFullAt).toBe(NOON);
  });
  it('locks the pool goal while the clock runs, so the clock cannot be stalled (audit M6)', () => {
    fillPool();
    expect(E.setPoolGoal(ctx('seed_ana'), 'Big night', 50_000)).toMatchObject({ ok: false, error: 'goal_locked' });
    expect(sq().poolFullAt).toBe(NOON);
    expect(sq().poolGoalCents).toBe(6000);
    // the clock still runs out as planned
    expect(E.settleCharity(ctx(null, NOON + WINDOW))).toBe(1);
  });
  it('lets the squad change the pool goal while the pool is not full', () => {
    expect(E.setPoolGoal(ctx(), 'Ramen', 9000).ok).toBe(true);
    expect(sq().poolGoalCents).toBe(9000);
    expect(sq().poolFullAt).toBeNull();
  });
});

describe('auto-donation', () => {
  it('does nothing before the deadline', () => {
    fillPool();
    expect(E.settleCharity(ctx(null, NOON + WINDOW - 1))).toBe(0);
    expect(Object.keys(s.donations)).toHaveLength(0);
  });
  it('donates the goal amount to the squad charity after the deadline', () => {
    fillPool();
    const before = sq().poolBalanceCents;
    expect(E.settleCharity(ctx(null, NOON + WINDOW))).toBe(1);
    const d = Object.values(s.donations)[0];
    expect(d).toMatchObject({ charityId: 'food-bank', amountCents: 6000, reason: 'auto_deadline' });
    expect(sq().poolBalanceCents).toBe(before - 6000);
    expect(s.feed[0].text).toContain('Local Food Bank');
    expect(sq().poolFullAt).toBeNull();
    expect(E.settleCharity(ctx(null, NOON + WINDOW + 1000))).toBe(0); // idempotent
  });
  it('uses the charity the squad picked', () => {
    expect(E.setCharity(ctx(), 'clean-water').ok).toBe(true);
    fillPool();
    E.settleCharity(ctx(null, NOON + WINDOW));
    expect(Object.values(s.donations)[0].charityId).toBe('clean-water');
  });
  it('waits while a vote is open, then donates once it is closed', () => {
    fillPool();
    const p = E.proposeCashout(ctx('seed_ana'), 'Pizza House');
    expect(p.ok).toBe(true);
    expect(E.settleCharity(ctx(null, NOON + WINDOW + DAY))).toBe(0);
    E.cancelCashout(ctx('seed_ana'), p.ok ? p.data.id : '');
    expect(E.settleCharity(ctx(null, NOON + WINDOW + DAY))).toBe(1);
  });
  it('overflow starts the next clock right away', () => {
    sq().poolBalanceCents = 14_000;
    E.forceFlake(ctx(), 'seed_goal_0');
    E.settleCharity(ctx(null, NOON + WINDOW));
    expect(sq().poolBalanceCents).toBeGreaterThanOrEqual(6000);
    expect(sq().poolFullAt).toBe(NOON + WINDOW);
  });
  it('a normal cash-out resets the clock', () => {
    fillPool();
    const p = E.proposeCashout(ctx(), 'Pizza House');
    const id = p.ok ? p.data.id : '';
    E.voteCashout(ctx('seed_ana'), id, true);
    E.voteCashout(ctx('seed_leo'), id, true);
    expect(s.cashouts[id].status).toBe('paid');
    expect(sq().poolBalanceCents).toBeLessThan(6000);
    expect(sq().poolFullAt).toBeNull();
  });
  it('keeps pool and balances consistent', () => {
    fillPool();
    const total = () => Object.values(s.users).reduce((a, u) => a + u.balanceCents, 0) + sq().poolBalanceCents
      + Object.values(s.donations).reduce((a, d) => a + d.amountCents, 0);
    const t0 = total();
    E.settleCharity(ctx(null, NOON + WINDOW));
    expect(total()).toBe(t0); // money only moves, never appears or vanishes
  });
});

describe('donation by vote', () => {
  it('needs a full pool and no other proposal', () => {
    expect(E.proposeDonation(ctx())).toMatchObject({ ok: false, error: 'pool_not_ready' });
    fillPool();
    expect(E.proposeDonation(ctx()).ok).toBe(true);
    expect(E.proposeDonation(ctx('seed_ana'))).toMatchObject({ ok: false, error: 'proposal_open' });
  });
  it('donates when the majority approves', () => {
    fillPool();
    const p = E.proposeDonation(ctx());
    const id = p.ok ? p.data.id : '';
    expect(p.ok && p.data.kind).toBe('donate');
    E.voteCashout(ctx('seed_ana'), id, true);
    E.voteCashout(ctx('seed_leo'), id, true);
    expect(s.cashouts[id].status).toBe('paid');
    expect(Object.values(s.donations)[0]).toMatchObject({ reason: 'vote', amountCents: 6000 });
  });
  it('does not donate when the squad says no', () => {
    fillPool();
    const p = E.proposeDonation(ctx());
    const id = p.ok ? p.data.id : '';
    E.voteCashout(ctx('seed_ana'), id, false);
    E.voteCashout(ctx('seed_leo'), id, false);
    E.voteCashout(ctx('seed_maya'), id, false);
    expect(s.cashouts[id].status).toBe('rejected');
    expect(Object.keys(s.donations)).toHaveLength(0);
  });
});

describe('choosing the charity', () => {
  it('validates the id and announces the change', () => {
    expect(E.setCharity(ctx(), 'nope')).toMatchObject({ ok: false, error: 'invalid_charity' });
    expect(E.setCharity(ctx(), 'animal-shelter').ok).toBe(true);
    expect(sq().charityId).toBe('animal-shelter');
    expect(s.feed[0].text).toContain('Animal Shelter Network');
  });
  it('is locked while a donation vote is open', () => {
    fillPool();
    E.proposeDonation(ctx());
    expect(E.setCharity(ctx('seed_ana'), 'clean-water')).toMatchObject({ ok: false, error: 'charity_locked' });
  });
  it('needs a squad', () => {
    const u = E.registerUser(ctx(null), { name: 'Solo', avatar: 'x' });
    expect(E.setCharity(ctx(u.ok ? u.data.id : null), 'clean-water')).toMatchObject({ ok: false, error: 'not_in_squad' });
  });
});

describe('demo helper', () => {
  it('expires the deadline and donates immediately', () => {
    expect(E.demoExpirePoolDeadline(ctx())).toMatchObject({ ok: false, error: 'pool_not_ready' });
    fillPool();
    expect(E.demoExpirePoolDeadline(ctx()).ok).toBe(true);
    expect(Object.keys(s.donations)).toHaveLength(1);
  });
});
