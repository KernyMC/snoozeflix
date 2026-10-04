import { describe, expect, it } from 'vitest';
import * as E from './engine';
import { makeSeed } from './seed';
import type { Ctx } from './state';

const AT = { lat: 42.2762, lng: -83.7357 };
const USERS = ['seed_kevin', 'seed_ana', 'seed_leo', 'seed_maya'];

describe('demo seed works on any weekday', () => {
  // 7 days x a few hours of the day, all in the squad timezone (America/Detroit, EDT in October)
  for (let day = 4; day <= 10; day++) {
    for (const hour of [9, 14, 20]) {
      const date = `2026-10-${String(day).padStart(2, '0')}`;
      it(`every teammate can start a check-in on ${date} at ${hour}:00`, () => {
        const now = new Date(`${date}T${String(hour).padStart(2, '0')}:00:00-04:00`).getTime();
        const s = makeSeed(now);
        for (const u of USERS) {
          const goal = Object.values(s.goals).find((g) => g.userId === u)!;
          const ctx: Ctx = { s, now, userId: u };
          const r = E.startCheckin(ctx, goal.id, { lat: goal.lat, lng: goal.lng });
          expect(r.ok, `${u} on ${date} ${hour}:00 -> ${!r.ok && r.error}`).toBe(true);
        }
      });
    }
  }
  it('does not flake anything while the seeded deadlines are still ahead, and flakes automatically after them', () => {
    const noon = new Date('2026-10-07T12:00:00-04:00').getTime();
    const s = makeSeed(noon);
    expect(E.evaluateDeadlines({ s, now: noon, userId: null })).toHaveLength(0);
    const late = new Date('2026-10-07T23:50:00-04:00').getTime();
    expect(E.evaluateDeadlines({ s, now: late, userId: null }).length).toBeGreaterThanOrEqual(4); // everybody who did not check in today
  });
  it('is consistent: pool equals penalties, nobody is over the free plan limit, no early halfway announcement', () => {
    const now = new Date('2026-10-07T12:00:00-04:00').getTime();
    const s = makeSeed(now);
    expect(s.squads.squad_mhacks.poolBalanceCents).toBe(Object.values(s.penalties).reduce((a, p) => a + p.amountCents, 0));
    const perUser = (u: string) => Object.values(s.goals).filter((g) => g.userId === u && g.active).length;
    for (const u of USERS) expect(perUser(u)).toBeLessThanOrEqual(1);
    expect(s.milestones['pool:squad_mhacks:6000:0.5']).toBe(true);
    expect(s.feed.find((f) => f.text.includes('Leo flaked'))!.createdAt).toBeLessThan(now - 2 * 86_400_000);
  });
});
