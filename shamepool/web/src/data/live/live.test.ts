import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { checkinOf, errResult, goalOf, okResult, resultOf } from './mappers';
import { HASH_RE, secretHash, sha256Hex } from './sha256';

describe('sha256', () => {
  it('matches node crypto for ascii, unicode and block-boundary inputs', () => {
    for (const s of ['', 'abc', 'Password1', 'héllo wörld \u{1F525}', 'x'.repeat(55), 'x'.repeat(56), 'x'.repeat(64), 'x'.repeat(1000)]) {
      expect(sha256Hex(s)).toBe(createHash('sha256').update(s, 'utf8').digest('hex'));
    }
  });
  it('salts per user and kind and is case-insensitive on the username', () => {
    expect(secretHash('Kevin', 'pw', 'Password1')).toBe(secretHash(' kevin ', 'pw', 'Password1'));
    expect(secretHash('kevin', 'pw', 'Password1')).not.toBe(secretHash('ana', 'pw', 'Password1'));
    expect(secretHash('kevin', 'pw', 'demo')).not.toBe(secretHash('kevin', 'ans', 'demo'));
    expect(HASH_RE.test(secretHash('kevin', 'pw', 'x'))).toBe(true);
  });
});

describe('action results', () => {
  it('round-trips ok data and error meta', () => {
    expect(resultOf<{ a: number }>(okResult({ a: 1 }))).toEqual({ ok: true, data: { a: 1 } });
    expect(resultOf(errResult('too_far', { distanceM: 42 }))).toEqual({ ok: false, error: 'too_far', meta: { distanceM: 42 } });
    expect(resultOf(errResult('no_user'))).toEqual({ ok: false, error: 'no_user', meta: undefined });
  });
});

describe('row mappers', () => {
  it('maps goal days and optional check-in AI fields', () => {
    const g = goalOf({
      id: 'g', userId: 'u', squadId: 's', title: 't', emoji: 'e', lat: 1, lng: 2, radiusM: 100, days: [1, 3], deadlineMinutes: 600, minStayMinutes: 1,
      basePenaltyCents: 500, maxPenaltyCents: 4000, consecutiveFlakes: 0, streak: 2, active: true, createdAt: 1, lastEvaluatedDate: '2026-01-01',
    });
    expect(g.daysOfWeek).toEqual([1, 3]);
    const base = { id: 'c', goalId: 'g', userId: 'u', squadId: 's', localDate: 'd', status: 'completed', startedAt: 1, lastDistanceM: 2, lastPingAt: 3, attempts: 1, aiReason: 'r', aiRoast: '' };
    expect(checkinOf({ ...base, aiState: '' }).aiVerified).toBeUndefined();
    expect(checkinOf({ ...base, aiState: 'no' })).toMatchObject({ aiVerified: false, aiReason: 'r', aiRoast: null });
  });
});
