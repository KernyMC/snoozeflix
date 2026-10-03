import { beforeEach, describe, expect, it } from 'vitest';
import { penaltyKey } from '../logic';
import * as E from './engine';
import { makeSeed } from './seed';
import type { Ctx, MockState } from './state';

// Wed 2026-10-07 12:00 America/Detroit (EDT)
const NOON = new Date('2026-10-07T12:00:00-04:00').getTime();
const T = 'seed_kevin';
const GYM = 'seed_goal_0';
let s: MockState;
const ctx = (userId: string | null = T, now = NOON): Ctx => ({ s, now, userId });
const pool = () => s.squads.squad_mhacks.poolBalanceCents;

beforeEach(() => { s = makeSeed(NOON); });

describe('seed invariants', () => {
  it('pool equals charged penalties; balances non-negative', () => {
    const charged = Object.values(s.penalties).reduce((a, p) => a + p.amountCents, 0);
    expect(pool()).toBe(charged);
    expect(pool()).toBe(3500);
    expect(Object.values(s.users).every((u) => u.balanceCents >= 0)).toBe(true);
  });
  it('nothing is flaked on first load', () => {
    expect(E.evaluateDeadlines(ctx(null, NOON + 8 * 3600_000))).toHaveLength(0);
  });
});

describe('forceFlake', () => {
  it('charges doubled penalty and is idempotent (P1)', () => {
    const r = E.forceFlake(ctx(), GYM);
    expect(r.ok && r.data.amountCents).toBe(1000);
    expect(pool()).toBe(4500);
    expect(s.goals[GYM].consecutiveFlakes).toBe(2);
    expect(s.goals[GYM].streak).toBe(0);
    const again = E.forceFlake(ctx(), GYM);
    expect(again.ok && again.data.amountCents).toBe(1000);
    expect(pool()).toBe(4500);
    expect(s.users[T].balanceCents).toBe(20000 - 2000 - 1000);
  });
  it('floors at zero balance (P2/P3)', () => {
    s.users[T].balanceCents = 300;
    const r = E.forceFlake(ctx(), GYM);
    expect(r.ok && r.data.amountCents).toBe(300);
    expect(r.ok && r.data.shortfallCents).toBe(700);
    expect(s.users[T].balanceCents).toBe(0);
    expect(s.feed.some((f) => f.kind === 'flake')).toBe(true);
    const goal2 = s.goals['seed_goal_1'];
    const r2 = E.forceFlake(ctx(), goal2.id);
    expect(r2.ok && r2.data.amountCents).toBe(0);
    expect(s.users[T].balanceCents).toBe(0);
  });
  it('already_done when completed today', () => {
    const start = E.startCheckin(ctx(), GYM, { lat: 42.2762, lng: -83.7357 });
    expect(start.ok).toBe(true);
    const id = start.ok ? start.data.id : '';
    E.finishCheckin(ctx(T, NOON + 61_000), id, 'x'.repeat(20));
    expect(E.forceFlake(ctx(), GYM)).toMatchObject({ ok: false, error: 'already_done' });
  });
  it('announces pool 50% once (F11)', () => {
    E.forceFlake(ctx(), GYM);
    E.forceFlake(ctx(), 'seed_goal_2');
    E.forceFlake(ctx(), 'seed_goal_4');
    expect(s.feed.filter((f) => f.kind === 'milestone')).toHaveLength(1);
  });
});

describe('scheduler', () => {
  it('catches up missed dates with escalating penalties (P8/P9)', () => {
    const r = E.createGoal(ctx(), {
      title: 'Read', emoji: '📖', lat: 42.27, lng: -83.74, radiusM: 100, daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      deadlineMinutes: 600, minStayMinutes: 5, basePenaltyCents: 500, maxPenaltyCents: 4000,
    });
    const g = r.ok ? r.data : (null as never);
    g.createdAt = NOON - 4 * 86_400_000;
    g.lastEvaluatedDate = '2026-10-02';
    const out = E.evaluateDeadlines(ctx());
    const mine = out.filter((p) => p.goalId === g.id);
    expect(mine.map((p) => p.localDate)).toEqual(['2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07']);
    expect(mine.map((p) => p.amountCents)).toEqual([500, 1000, 2000, 4000]);
    expect(E.evaluateDeadlines(ctx())).toHaveLength(0); // idempotent
  });
  it('respects the 10 min grace for in-progress check-ins (C20)', () => {
    const start = E.startCheckin(ctx(null), GYM, { lat: 0, lng: 0 });
    expect(start.ok).toBe(false);
    const t1 = new Date('2026-10-07T17:58:00-04:00').getTime();
    s.goals[GYM].lastEvaluatedDate = '2026-10-06';
    const st = E.startCheckin(ctx(T, t1), GYM, { lat: 42.2762, lng: -83.7357 });
    expect(st.ok).toBe(true);
    const t2 = new Date('2026-10-07T18:05:00-04:00').getTime();
    expect(E.evaluateDeadlines(ctx(null, t2)).filter((p) => p.goalId === GYM)).toHaveLength(0);
    const t3 = new Date('2026-10-07T18:11:00-04:00').getTime();
    expect(E.evaluateDeadlines(ctx(null, t3)).filter((p) => p.goalId === GYM)).toHaveLength(1);
    expect(s.penalties[penaltyKey(GYM, '2026-10-07')]).toBeTruthy();
  });
  it('completed day is not flaked', () => {
    const st = E.startCheckin(ctx(), GYM, { lat: 42.2762, lng: -83.7357 });
    E.finishCheckin(ctx(T, NOON + 61_000), st.ok ? st.data.id : '', 'x'.repeat(20));
    s.goals[GYM].lastEvaluatedDate = '2026-10-06';
    const t = new Date('2026-10-07T19:00:00-04:00').getTime();
    expect(E.evaluateDeadlines(ctx(null, t)).filter((p) => p.goalId === GYM)).toHaveLength(0);
  });
});

describe('check-in flow', () => {
  const at = { lat: 42.2762, lng: -83.7357 };
  it('too_far gives distance (C4)', () => {
    const r = E.startCheckin(ctx(), GYM, { lat: 42.3, lng: -83.7357 });
    expect(r).toMatchObject({ ok: false, error: 'too_far' });
    expect(!r.ok && Number(r.meta?.distanceM)).toBeGreaterThan(2000);
  });
  it('not_due_today on a non-scheduled day (C5)', () => {
    const sat = new Date('2026-10-10T12:00:00-04:00').getTime();
    expect(E.startCheckin(ctx(T, sat), GYM, at)).toMatchObject({ ok: false, error: 'not_due_today' });
  });
  it('deadline_passed (C6)', () => {
    const late = new Date('2026-10-07T19:00:00-04:00').getTime();
    expect(E.startCheckin(ctx(T, late), GYM, at)).toMatchObject({ ok: false, error: 'deadline_passed' });
  });
  it('too_early then success, idempotent finish, streak +1 (C11/C19)', () => {
    const st = E.startCheckin(ctx(), GYM, at);
    const id = st.ok ? st.data.id : '';
    const early = E.finishCheckin(ctx(T, NOON + 10_000), id, 'x'.repeat(20));
    expect(early).toMatchObject({ ok: false, error: 'too_early' });
    expect(!early.ok && early.meta?.secondsLeft).toBe(50);
    const before = s.goals[GYM].streak;
    const done = E.finishCheckin(ctx(T, NOON + 61_000), id, 'x'.repeat(20));
    expect(done.ok).toBe(true);
    expect(s.goals[GYM].streak).toBe(before + 1);
    expect(s.goals[GYM].consecutiveFlakes).toBe(0); // P5
    const again = E.finishCheckin(ctx(T, NOON + 62_000), id, 'x'.repeat(20));
    expect(again.ok).toBe(true);
    expect(s.goals[GYM].streak).toBe(before + 1);
    expect(E.startCheckin(ctx(T, NOON + 70_000), GYM, at)).toMatchObject({ ok: false, error: 'already_done' });
  });
  it('resume existing in-progress check-in (C9)', () => {
    const a = E.startCheckin(ctx(), GYM, at);
    const b = E.startCheckin(ctx(T, NOON + 5000), GYM, at);
    expect(a.ok && b.ok && a.data.id === b.data.id).toBe(true);
  });
  it('left_area fails the check-in; a new attempt is allowed (C10)', () => {
    const a = E.startCheckin(ctx(), GYM, at);
    const id = a.ok ? a.data.id : '';
    expect(E.pingCheckin(ctx(), id, { lat: 42.3, lng: -83.7 })).toMatchObject({ ok: false, error: 'left_area' });
    expect(s.checkins[id].status).toBe('failed');
    const again = E.startCheckin(ctx(T, NOON + 1000), GYM, at);
    expect(again.ok).toBe(true);
  });
  it('rejected photo → retry → max 3 attempts (C16)', () => {
    const a = E.startCheckin(ctx(), GYM, at);
    const id = a.ok ? a.data.id : '';
    s.demo.nextPhotoFails = true;
    const r1 = E.finishCheckin(ctx(T, NOON + 61_000), id, 'x'.repeat(20));
    expect(r1).toMatchObject({ ok: false, error: 'photo_rejected' });
    expect(s.checkins[id].status).toBe('in_progress');
    s.demo.nextPhotoFails = true;
    E.finishCheckin(ctx(T, NOON + 62_000), id, 'x'.repeat(20));
    s.demo.nextPhotoFails = true;
    const r3 = E.finishCheckin(ctx(T, NOON + 63_000), id, 'x'.repeat(20));
    expect(r3).toMatchObject({ ok: false, error: 'too_many_attempts' });
    expect(s.checkins[id].status).toBe('failed');
  });
  it('invalid photo (C15)', () => {
    const a = E.startCheckin(ctx(), GYM, at);
    expect(E.finishCheckin(ctx(T, NOON + 61_000), a.ok ? a.data.id : '', '')).toMatchObject({ ok: false, error: 'invalid_photo' });
  });
  it('cannot check in for someone else (not_your_goal)', () => {
    expect(E.startCheckin(ctx('seed_ana'), GYM, at)).toMatchObject({ ok: false, error: 'not_your_goal' });
  });
  it('already_flaked blocks check-in (C8)', () => {
    E.forceFlake(ctx(), GYM);
    expect(E.startCheckin(ctx(), GYM, at)).toMatchObject({ ok: false, error: 'already_flaked' });
  });
});

describe('identity / squad', () => {
  it('registers and joins with messy code (E2)', () => {
    const u = E.registerUser(ctx(null), { name: '  Zed ', avatar: '🦊' });
    expect(u.ok && u.data.name).toBe('Zed');
    const j = E.joinSquad(ctx(u.ok ? u.data.id : null), ' pizza6 ');
    expect(j.ok).toBe(true);
    expect(E.joinSquad(ctx(u.ok ? u.data.id : null), 'PIZZA6')).toMatchObject({ ok: false, error: 'already_in_squad' });
  });
  it('rejects bad name, bad code, full squad', () => {
    expect(E.registerUser(ctx(null), { name: '   ', avatar: 'x' })).toMatchObject({ ok: false, error: 'invalid_name' });
    const u = E.registerUser(ctx(null), { name: 'Q', avatar: 'x' });
    const id = u.ok ? u.data.id : null;
    expect(E.joinSquad(ctx(id), 'NOPE12')).toMatchObject({ ok: false, error: 'invalid_code' });
    for (let i = 0; i < 4; i++) {
      const x = E.registerUser(ctx(null), { name: 'P' + i, avatar: 'x' });
      E.joinSquad(ctx(x.ok ? x.data.id : null), 'PIZZA6');
    }
    expect(E.joinSquad(ctx(id), 'PIZZA6')).toMatchObject({ ok: false, error: 'squad_full' });
  });
  it('creates squad with unique code and $200 start', () => {
    const u = E.registerUser(ctx(null), { name: 'Neo', avatar: '🕶️' });
    const sq = E.createSquad(ctx(u.ok ? u.data.id : null), { name: 'Matrix', poolGoalName: 'Ramen', poolGoalCents: 3000 });
    expect(sq.ok && sq.data.inviteCode).toMatch(/^[A-Z2-9]{6}$/);
    expect(u.ok && u.data.balanceCents).toBe(20000);
    expect(E.createSquad(ctx(u.ok ? u.data.id : null), { name: 'x', poolGoalName: 'y', poolGoalCents: 1 })).toMatchObject({ ok: false, error: 'already_in_squad' });
  });
});

describe('goals', () => {
  const base = { title: 'Walk', emoji: '🚶', lat: 42.27, lng: -83.74, radiusM: 100, daysOfWeek: [1], deadlineMinutes: 600, minStayMinutes: 5, basePenaltyCents: 500, maxPenaltyCents: 4000 };
  it('limits goals per user (G8) and validates', () => {
    for (let i = 0; i < 3; i++) expect(E.createGoal(ctx(), base).ok).toBe(true); // Kevin has 2 seeds
    expect(E.createGoal(ctx(), base)).toMatchObject({ ok: false, error: 'too_many_goals' });
    expect(E.createGoal(ctx('seed_ana'), { ...base, daysOfWeek: [] })).toMatchObject({ ok: false, error: 'no_days' });
  });
  it('changing penalty keeps consecutiveFlakes (G12)', () => {
    const r = E.updateGoalPenalty(ctx(), GYM, 1000);
    expect(r.ok && r.data.consecutiveFlakes).toBe(1);
    expect(E.updateGoalPenalty(ctx('seed_ana'), GYM, 1000)).toMatchObject({ ok: false, error: 'not_your_goal' });
    expect(E.updateGoalPenalty(ctx(), GYM, 999999)).toMatchObject({ ok: false, error: 'invalid_penalty' });
  });
});

describe('feed & bot', () => {
  it('validates, rate-limits, escapes nothing (F1/F2)', () => {
    expect(E.postMessage(ctx(), '   ')).toMatchObject({ ok: false, error: 'invalid_message' });
    expect(E.postMessage(ctx(), 'x'.repeat(281))).toMatchObject({ ok: false, error: 'invalid_message' });
    for (let i = 0; i < 5; i++) expect(E.postMessage(ctx(T, NOON + i), 'hi ' + i).ok).toBe(true);
    expect(E.postMessage(ctx(T, NOON + 6), 'spam')).toMatchObject({ ok: false, error: 'rate_limited' });
    expect(E.postMessage(ctx(T, NOON + 11_000), 'ok again').ok).toBe(true);
  });
  it('@squadbot replies into the feed (F5)', () => {
    E.postMessage(ctx(), 'hey how close are we to pizza? @squadbot');
    expect(s.feed[0].kind).toBe('bot');
    expect(s.feed[0].text).toContain('$35 of $60');
    expect(s.feed[0].text).toContain('Kevin');
  });
  it('action flow with confirm, expiry and idempotency (F8/F9)', () => {
    const r = E.askBot(ctx(), 'raise my gym penalty to $10');
    const act = r.ok ? r.data.pendingAction : undefined;
    expect(act).toBeTruthy();
    expect(E.confirmBotAction(ctx(), act!.id).ok).toBe(true);
    expect(s.goals[GYM].basePenaltyCents).toBe(1000);
    expect(E.confirmBotAction(ctx(), act!.id)).toMatchObject({ ok: false, error: 'action_not_found' });
    const r2 = E.askBot(ctx(), 'set my gym penalty to $20');
    const a2 = r2.ok ? r2.data.pendingAction : undefined;
    expect(E.confirmBotAction(ctx(T, NOON + 6 * 60_000), a2!.id)).toMatchObject({ ok: false, error: 'action_expired' });
  });
  it('refuses out-of-bounds and other users (F7/F10)', () => {
    const r = E.askBot(ctx(), 'raise my gym penalty to $500');
    expect(r.ok && r.data.pendingAction).toBeFalsy();
    const r2 = E.askBot(ctx(), 'raise my gym penalty to $10');
    expect(E.confirmBotAction(ctx('seed_ana'), r2.ok ? r2.data.pendingAction!.id : '')).toMatchObject({ ok: false, error: 'action_not_found' });
  });
});

describe('cash-out', () => {
  it('needs full pool, strict majority, then pays (X1-X4, X7)', () => {
    expect(E.proposeCashout(ctx(), 'Pizza House')).toMatchObject({ ok: false, error: 'pool_not_ready' });
    s.squads.squad_mhacks.poolBalanceCents = 6500;
    const p = E.proposeCashout(ctx(), '');
    const id = p.ok ? p.data.id : '';
    expect(p.ok && p.data.merchantName).toBe('Pizza House');
    expect(E.proposeCashout(ctx('seed_ana'), 'x')).toMatchObject({ ok: false, error: 'proposal_open' });
    expect(E.voteCashout(ctx('seed_ana'), id, true).ok).toBe(true);
    expect(s.cashouts[id].status).toBe('open'); // 2 of 4 is a tie
    expect(E.voteCashout(ctx('seed_ana'), id, false).ok).toBe(true); // vote replaced (X3)
    expect(s.cashouts[id].votes.seed_ana).toBe(false);
    E.voteCashout(ctx('seed_ana'), id, true);
    E.voteCashout(ctx('seed_leo'), id, true);
    expect(s.cashouts[id].status).toBe('paid');
    expect(pool()).toBe(500);
    expect(s.feed.some((f) => f.kind === 'cashout' && f.text.includes('Approved'))).toBe(true);
  });
  it('rejects with strict majority of no; proposer can cancel (X4)', () => {
    s.squads.squad_mhacks.poolBalanceCents = 6000;
    const p = E.proposeCashout(ctx(), 'Pizza House');
    const id = p.ok ? p.data.id : '';
    E.voteCashout(ctx('seed_ana'), id, false);
    E.voteCashout(ctx('seed_leo'), id, false);
    expect(s.cashouts[id].status).toBe('open'); // 1 yes 2 no of 4: no*2 = 4 not > 4
    expect(E.cancelCashout(ctx('seed_ana'), id)).toMatchObject({ ok: false });
    expect(E.cancelCashout(ctx(), id).ok).toBe(true);
    expect(pool()).toBe(6000);
  });
  it('re-checks pool at approval (X6)', () => {
    s.squads.squad_mhacks.poolBalanceCents = 6000;
    const p = E.proposeCashout(ctx(), 'Pizza House');
    const id = p.ok ? p.data.id : '';
    s.squads.squad_mhacks.poolBalanceCents = 100;
    E.voteCashout(ctx('seed_ana'), id, true);
    expect(E.voteCashout(ctx('seed_leo'), id, true)).toMatchObject({ ok: false, error: 'pool_changed' });
  });
});

describe('global invariants (P13)', () => {
  it('pool == charged penalties - paid cash-outs after chaos', () => {
    for (const g of Object.keys(s.goals)) E.forceFlake(ctx('seed_kevin'), g);
    E.evaluateDeadlines(ctx(null, NOON + 12 * 3600_000));
    const charged = Object.values(s.penalties).reduce((a, p) => a + p.amountCents, 0);
    expect(pool()).toBe(charged);
    expect(Object.values(s.users).every((u) => u.balanceCents >= 0 && Number.isInteger(u.balanceCents))).toBe(true);
  });
});
