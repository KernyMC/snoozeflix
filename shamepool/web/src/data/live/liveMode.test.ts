import { describe, expect, it } from 'vitest';
import { planDemoPatch } from './demo';
import { demoFlagsOf } from './hooks';
import { loadToken, saveToken } from './stdb';
import * as live from './index';
import * as mock from '../mock';

class MemStore implements Storage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  clear() { this.m.clear(); }
  getItem(k: string) { return this.m.get(k) ?? null; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  removeItem(k: string) { this.m.delete(k); }
  setItem(k: string, v: string) { this.m.set(k, v); }
}

describe('live demo controls on the shared database', () => {
  it('keeps fake location in the tab and sends only "next photo fails" to the module', () => {
    expect(planDemoPatch({ fakeLocation: { lat: 1, lng: 2, accuracyM: 5 } }, 0)).toEqual({ refuse: false, fake: { lat: 1, lng: 2, accuracyM: 5 } });
    expect(planDemoPatch({ fakeLocation: null }, 0)).toEqual({ refuse: false, fake: null });
    expect(planDemoPatch({ nextPhotoFails: true }, 0)).toEqual({ refuse: false, nextPhotoFails: true });
  });
  it('refuses any clock change, but resetting an unchanged clock is a no-op', () => {
    expect(planDemoPatch({ timeOffsetMs: 60_000 }, 0).refuse).toBe(true);
    expect(planDemoPatch({ timeOffsetMs: 0 }, 0)).toEqual({ refuse: false });
    expect(planDemoPatch({ timeOffsetMs: 0 }, 5_000).refuse).toBe(true);
  });
  it('ignores the module-wide fake location and uses this tab’s one', () => {
    const shared = { nextPhotoFails: true, timeOffsetMs: 0, fakeOn: true, fakeLat: 9, fakeLng: 9, fakeAcc: 9 };
    expect(demoFlagsOf(shared)).toEqual({ nextPhotoFails: true, timeOffsetMs: 0, fakeLocation: null });
    expect(demoFlagsOf(shared, { lat: 1, lng: 2 })).toEqual({ nextPhotoFails: true, timeOffsetMs: 0, fakeLocation: { lat: 1, lng: 2 } });
    expect(demoFlagsOf(null)).toEqual({ nextPhotoFails: false, timeOffsetMs: 0, fakeLocation: null });
  });
});

describe('live identity token', () => {
  it('survives in localStorage and still reads the per-tab token older builds saved', () => {
    const local = new MemStore();
    const session = new MemStore();
    expect(loadToken({ local, session })).toBeUndefined();
    session.setItem('shamepool-stdb-token', 'old-tab-token');
    expect(loadToken({ local, session })).toBe('old-tab-token');
    saveToken('tok-1', { local, session });
    expect(local.getItem('shamepool-stdb-token')).toBe('tok-1');
    expect(loadToken({ local, session: new MemStore() })).toBe('tok-1'); // a new tab keeps the same identity
  });
  it('does not throw when storage is blocked', () => {
    const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } } as unknown as Storage;
    expect(loadToken({ local: blocked, session: null })).toBeUndefined();
    expect(() => saveToken('x', { local: blocked, session: blocked })).not.toThrow();
  });
});

describe('live layer contract', () => {
  it('exports every name the mock layer exports', () => {
    const missing = Object.keys(mock).filter((k) => !(k in live));
    expect(missing).toEqual([]);
  });
  it('degrades unsupported features with not_available instead of failing silently', async () => {
    for (const p of [live.setCharity('x'), live.proposeDonation(), live.demoExpirePoolDeadline(), live.claimSeedUser('seed_kevin'), live.resetDemoData()]) {
      expect(await p).toEqual({ ok: false, error: 'not_available' });
    }
    expect(await live.setDemoFlags({ timeOffsetMs: 3_600_000 })).toEqual({ ok: false, error: 'not_available' });
    expect(live.useCharityStatus()).toBeNull();
    expect(live.useDonations()).toEqual([]);
  });
});

describe('live useMe loading rule', () => {
  const row = { id: 'u1', name: 'Eve', avatar: 'a', squadId: 'sq1', balanceCents: 100, isSeed: false };
  it('is loading until connected, null without identity', async () => {
    const { meState } = await import('./hooks');
    expect(meState('connecting', row, 'sq1')).toBeUndefined();
    expect(meState('ready', null, '')).toBeNull();
  });
  it('stays loading until the squad rows are synced, then returns the user', async () => {
    const { meState } = await import('./hooks');
    expect(meState('ready', row, '')).toBeUndefined();
    expect(meState('ready', row, 'other')).toBeUndefined();
    expect(meState('ready', row, 'sq1')).toMatchObject({ id: 'u1', squadId: 'sq1' });
    expect(meState('ready', { ...row, squadId: '' }, '')).toMatchObject({ id: 'u1', squadId: null });
  });
});
