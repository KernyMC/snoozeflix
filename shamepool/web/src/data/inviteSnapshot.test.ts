import { describe, expect, it } from 'vitest';
import { decodeSnapshot, encodeSnapshot } from './inviteSnapshot';
import * as E from './mock/engine';
import { makeSeed } from './mock/seed';
import type { Ctx } from './mock/state';

const NOON = new Date('2026-10-07T12:00:00-04:00').getTime();
const makeCtx = (): Ctx => ({ s: makeSeed(NOON, 'weekly'), now: NOON, userId: null });

const snap = { code: 'ABC234', id: 'sq_zz1abc', name: 'Gym Rats', poolGoalName: 'Pizza night', poolGoalCents: 6000, ownerName: 'Ana', ownerAvatar: '/assets/avatar/01-coin-thief.png' };

describe('invite snapshot', () => {
  it('round-trips, including non-ASCII names', () => {
    expect(decodeSnapshot(encodeSnapshot(snap))).toEqual(snap);
    const n = { ...snap, name: 'Café ñandú' };
    expect(decodeSnapshot(encodeSnapshot(n))?.name).toBe('Café ñandú');
  });
  it('rejects garbage, oversize and bad fields', () => {
    expect(decodeSnapshot(null)).toBeNull();
    expect(decodeSnapshot('%%%')).toBeNull();
    expect(decodeSnapshot('x'.repeat(2000))).toBeNull();
    expect(decodeSnapshot(encodeSnapshot({ ...snap, id: '../evil' }))).toBeNull();
    expect(decodeSnapshot(encodeSnapshot({ ...snap, poolGoalCents: -5 }))).toBeNull();
    expect(decodeSnapshot(encodeSnapshot({ ...snap, ownerAvatar: 'http://evil/x.png' }))).toBeNull();
  });
  it('lets a device that never saw the squad join it from the link', () => {
    const c = makeCtx();
    const u = E.registerUser(c, { name: 'Bo', avatar: '' });
    if (!u.ok) throw new Error('reg');
    c.userId = u.data.id;
    expect(E.joinSquad(c, 'ABC234').ok).toBe(false);
    const r = E.joinSquad(c, 'abc234', decodeSnapshot(encodeSnapshot(snap)));
    expect(r.ok).toBe(true);
    expect(c.s.users[u.data.id]?.squadId).toBe('sq_zz1abc');
    expect(Object.values(c.s.users).filter((x) => x.squadId === 'sq_zz1abc').map((x) => x.name).sort()).toEqual(['Ana', 'Bo']);
  });
  it('ignores a snapshot whose code differs from the one typed', () => {
    const c = makeCtx();
    const u = E.registerUser(c, { name: 'Bo', avatar: '' });
    if (!u.ok) throw new Error('reg');
    c.userId = u.data.id;
    expect(E.joinSquad(c, 'ZZZZZZ', snap).ok).toBe(false);
  });
});
