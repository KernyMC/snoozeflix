import { beforeEach, describe, expect, it } from 'vitest';
import { kickError, ownerFromFeed } from '../logic';
import * as E from './engine';
import { makeSeed } from './seed';
import type { Ctx, MockState } from './state';

const NOON = new Date('2026-10-07T12:00:00-04:00').getTime();
let s: MockState;
const ctx = (userId: string | null, now = NOON): Ctx => ({ s, now, userId });
const SQ = 'squad_mhacks';

beforeEach(() => { s = makeSeed(NOON, 'weekly'); });

describe('kick rules (shared logic)', () => {
  const me = { id: 'a', squadId: 'sq' };
  it('allows only the owner to remove a current member of the same squad', () => {
    expect(kickError(me, 'a', { id: 'b', squadId: 'sq' })).toBeNull();
    expect(kickError(me, 'z', { id: 'b', squadId: 'sq' })).toBe('not_owner');
    expect(kickError(me, null, { id: 'b', squadId: 'sq' })).toBe('not_owner');
    expect(kickError(me, 'a', { id: 'a', squadId: 'sq' })).toBe('cannot_kick_self');
    expect(kickError(me, 'a', { id: 'b', squadId: 'other' })).toBe('member_not_found');
    expect(kickError(me, 'a', null)).toBe('member_not_found');
    expect(kickError(null, 'a', { id: 'b', squadId: 'sq' })).toBe('no_user');
    expect(kickError({ id: 'a', squadId: null }, 'a', { id: 'b', squadId: 'sq' })).toBe('not_in_squad');
  });
  it('finds the owner of older squads from the earliest "started the squad" event', () => {
    expect(ownerFromFeed([
      { kind: 'commit', text: 'Bo joined the squad. Fresh money!', actorUserId: 'b', createdAt: 2 },
      { kind: 'commit', text: 'Al started the squad "X". Goal: Pizza.', actorUserId: 'a', createdAt: 1 },
    ])).toBe('a');
    expect(ownerFromFeed([{ kind: 'message', text: 'I started the squad lol', actorUserId: 'c', createdAt: 0 }])).toBeNull();
  });
});

describe('kickMember (mock engine)', () => {
  it('only the creator can remove; Kevin owns the seed squad', () => {
    expect(E.ownerOf(s, SQ)).toBe('seed_kevin');
    const r = E.kickMember(ctx('seed_ana'), 'seed_leo');
    expect(r).toEqual({ ok: false, error: 'not_owner', meta: undefined });
    expect(s.users.seed_leo.squadId).toBe(SQ);
    expect(E.kickMember(ctx('seed_kevin'), 'seed_kevin')).toMatchObject({ ok: false, error: 'cannot_kick_self' });
  });

  it('removes the member, stops their goals, keeps their money and the pool, and posts to the feed', () => {
    const pool = s.squads[SQ].poolBalanceCents;
    const bal = s.users.seed_leo.balanceCents;
    expect(E.kickMember(ctx('seed_kevin'), 'seed_leo')).toEqual({ ok: true, data: true });
    expect(s.users.seed_leo.squadId).toBeNull();
    expect(s.users.seed_leo.balanceCents).toBe(bal);
    expect(s.squads[SQ].poolBalanceCents).toBe(pool);
    expect(Object.values(s.goals).filter((g) => g.userId === 'seed_leo').every((g) => !g.active)).toBe(true);
    expect(s.feed[0].text).toContain('removed Leo from the squad');
    // The scheduler never charges a removed member into the old squad.
    expect(E.evaluateDeadlines(ctx(null, NOON + 3 * 86_400_000)).filter((p) => p.userId === 'seed_leo')).toHaveLength(0);
  });

  it('cannot rejoin with the same code, but can start or join another squad', () => {
    E.kickMember(ctx('seed_kevin'), 'seed_leo');
    expect(E.joinSquad(ctx('seed_leo'), 'PIZZA6')).toMatchObject({ ok: false, error: 'kicked_from_squad' });
    const own = E.createSquad(ctx('seed_leo'), { name: 'Leo Band', poolGoalName: 'Strings', poolGoalCents: 2000 });
    expect(own.ok && own.data.ownerUserId).toBe('seed_leo');
  });

  it('a second kick of the same person is refused (already gone)', () => {
    E.kickMember(ctx('seed_kevin'), 'seed_leo');
    expect(E.kickMember(ctx('seed_kevin'), 'seed_leo')).toMatchObject({ ok: false, error: 'member_not_found' });
  });

  it('fails their open check-in and cancels the cash-out they proposed', () => {
    const leoGoal = Object.values(s.goals).find((g) => g.userId === 'seed_leo')!;
    s.checkins.ck_x = {
      id: 'ck_x', goalId: leoGoal.id, userId: 'seed_leo', localDate: '2026-10-07', status: 'in_progress', startedAt: NOON, lastDistanceM: 1, lastPingAt: NOON,
      attempts: 0,
    } as never;
    s.squads[SQ].poolBalanceCents = s.squads[SQ].poolGoalCents;
    const p = E.proposeCashout(ctx('seed_leo'), 'Pizza');
    expect(p.ok && p.data.status).toBe('open');
    E.kickMember(ctx('seed_kevin'), 'seed_leo');
    expect(s.checkins.ck_x.status).toBe('failed');
    expect(p.ok && s.cashouts[p.data.id].status).toBe('cancelled');
  });

  it('re-counts an open vote with the smaller squad', () => {
    s.squads[SQ].poolBalanceCents = s.squads[SQ].poolGoalCents;
    const p = E.proposeCashout(ctx('seed_kevin'), 'Pizza'); // Kevin yes: 1 of 4
    E.voteCashout(ctx('seed_ana'), p.ok ? p.data.id : '', true); // 2 of 4: not a majority yet
    expect(p.ok && s.cashouts[p.data.id].status).toBe('open');
    E.kickMember(ctx('seed_kevin'), 'seed_leo'); // 2 of 3 now: approved
    expect(p.ok && s.cashouts[p.data.id].status).toBe('paid');
  });
});
