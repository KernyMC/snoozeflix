import { DEFAULT_TZ, dateAddDays, dowOfDate, localDate, penaltyKey } from '../logic';
import type { Checkin, Goal, Penalty, User } from '../types';
import { hash } from './authEngine';
import { MOCK_VERSION, type MockState } from './state';

const DAY = 86_400_000;

export function makeSeed(now: number): MockState {
  const tz = DEFAULT_TZ;
  const today = localDate(now, tz);
  const s: MockState = {
    version: MOCK_VERSION, users: {}, accounts: {}, authAttempts: {}, resetTokens: {}, squads: {}, goals: {}, checkins: {}, penalties: {}, feed: [], cashouts: {}, withdrawals: {},
    botThreads: {}, pendingActions: {}, milestones: {}, msgTimes: {}, seedUserIds: [],
    demo: { nextPhotoFails: false, fakeLocation: null, timeOffsetMs: 0 }, seq: 1, rev: 1,
  };
  const squadId = 'squad_mhacks';
  s.squads[squadId] = {
    id: squadId, name: 'MHacks Crew', inviteCode: 'PIZZA6', poolGoalName: 'Pizza night', poolGoalCents: 6000,
    poolBalanceCents: 0, timezone: tz, relayLinked: false,
  };
  const people: Array<[string, string, string]> = [
    ['kevin', 'Kevin', '/assets/avatar/01-coin-thief.png'], ['ana', 'Ana', '/assets/avatar/02-savings-buddy.png'], ['leo', 'Leo', '/assets/avatar/03-wallet-friend.png'], ['maya', 'Maya', '/assets/avatar/04-fist-bump.png'],
  ];
  for (const [k, name, avatar] of people) {
    const u: User = { id: `seed_${k}`, name, avatar, squadId, balanceCents: 20000 };
    s.users[u.id] = u;
    s.seedUserIds.push(u.id);
    // Demo login: username = lowercase name, password "Password1", security answers all "demo".
    s.accounts[k] = {
      userId: u.id, username: k, email: `${k}@example.com`, firstName: name, lastName: 'Demo', passwordHash: hash('Password1'),
      security: ['pet', 'city', 'car'].map((qId) => ({ qId, answerHash: hash('demo') })),
    };
  }
  // Kevin starts with a saved address and card so the profile has something to show. Everyone else starts empty.
  s.billing = {
    seed_kevin: {
      tier: 'free',
      addresses: [{
        id: 'seed_addr_home', label: 'Home', fullName: 'Kevin Demo', line1: '123 Demo Street', line2: 'Apt 4', city: 'Ann Arbor', state: 'MI', zip: '48104',
        createdAt: now - 9 * DAY,
      }],
      payments: [{
        id: 'seed_pm_visa', nickname: 'Everyday Visa', nameOnCard: 'Kevin Demo', brand: 'visa', last4: '4242',
        expMonth: 9, expYear: new Date(now).getUTCFullYear() + 3, addressId: 'seed_addr_home', createdAt: now - 9 * DAY,
      }],
    },
  };
  // [owner, title, icon key (stored in `emoji`), lat, lng, days, deadlineMin, penalty, skipIdx[]]
  const defs: Array<[string, string, string, number, number, number[], number, number, number[]]> = [
    ['kevin', 'Gym', 'goal-gym', 42.2762, -83.7357, [1, 2, 3, 4, 5], 18 * 60, 500, [1, 3]],
    ['kevin', 'Study at the library', 'goal-book', 42.2768, -83.7382, [0, 1, 2, 3, 4], 21 * 60, 500, [2]],
    ['ana', 'Morning run', 'goal-run', 42.2780, -83.7382, [1, 2, 3, 4, 5, 6], 9 * 60, 500, []],
    ['leo', 'Practice guitar', 'goal-guitar', 42.2750, -83.7415, [1, 3, 5], 20 * 60, 500, [0]],
    ['maya', 'Yoga', 'goal-yoga', 42.2762, -83.7357, [2, 4, 6], 19 * 60, 500, []],
  ];
  let n = 0;
  for (const [owner, title, emoji, lat, lng, days, deadline, base, skip] of defs) {
    const g: Goal = {
      id: `seed_goal_${n++}`, userId: `seed_${owner}`, squadId, title, emoji, lat, lng, radiusM: 150, daysOfWeek: days,
      deadlineMinutes: deadline, minStayMinutes: 1, basePenaltyCents: base, maxPenaltyCents: 4000,
      consecutiveFlakes: 0, streak: 0, active: true, createdAt: now - 10 * DAY, lastEvaluatedDate: today,
    };
    let idx = 0;
    let streak = 0;
    for (let i = 6; i >= 1; i--) {
      const d = dateAddDays(today, -i);
      if (!days.includes(dowOfDate(d))) continue;
      const missed = skip.includes(idx++);
      if (missed) { streak = 0; continue; }
      streak++;
      const c: Checkin = {
        id: `seed_ci_${g.id}_${d}`, goalId: g.id, userId: g.userId, localDate: d, status: 'completed',
        startedAt: now - i * DAY, lastDistanceM: 20, lastPingAt: now - i * DAY, attempts: 1, aiVerified: true,
      };
      s.checkins[c.id] = c;
    }
    g.streak = streak;
    s.goals[g.id] = g;
  }
  // Kevin's gym: one earlier flake, so the next flake costs $10 (doubled).
  s.goals['seed_goal_0'].consecutiveFlakes = 1;
  s.goals['seed_goal_0'].streak = 0;

  const pen = (goalId: string, offset: number, cents: number): void => {
    const g = s.goals[goalId];
    const date = dateAddDays(today, -offset);
    const p: Penalty = {
      id: `seed_pen_${goalId}_${offset}`, goalId, userId: g.userId, squadId, localDate: date, amountCents: cents,
      intendedCents: cents, shortfallCents: 0, status: 'charged', createdAt: now - offset * DAY,
    };
    s.penalties[penaltyKey(goalId, date)] = p;
    s.users[g.userId].balanceCents -= cents;
    s.squads[squadId].poolBalanceCents += cents;
  };
  pen('seed_goal_0', 2, 2000);
  pen('seed_goal_3', 3, 1500);

  const ev = (actor: string | null, kind: 'commit' | 'checkin' | 'flake' | 'bot' | 'milestone', text: string, ago: number) =>
    s.feed.push({ id: `seed_f_${s.feed.length}`, squadId, actorUserId: actor, kind, text, createdAt: now - ago });
  ev('seed_ana', 'checkin', 'Ana kept her promise: Morning run. 6 days in a row 🔥', 25 * 60_000);
  ev(null, 'bot', 'Leo flaked on "Practice guitar". $15 to the pool. The strings are lonely.', 3 * 3600_000);
  ev('seed_kevin', 'flake', 'Kevin flaked on "Gym". $20 to the pool.', 2 * DAY);
  ev('seed_maya', 'commit', 'Maya committed to Yoga. Brave.', 5 * DAY);
  s.feed.sort((a, b) => b.createdAt - a.createdAt);
  return s;
}
