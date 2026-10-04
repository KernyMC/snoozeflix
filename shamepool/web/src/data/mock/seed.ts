import { DEFAULT_TZ, dateAddDays, deadlinePassed, dowOfDate, localDate, penaltyKey } from '../logic';
import type { Checkin, Goal, Penalty, User } from '../types';
import { hash } from './authEngine';
import demoUsers from './demoUsers.json';
import { MOCK_VERSION, type MockState } from './state';

const DAY = 86_400_000;

/**
 * `demo` (default): every seeded goal is due every day with a late deadline, so any teammate can check in on stage
 * whatever the weekday or hour. `weekly`: the original Mon-Fri schedule, used by the unit tests.
 */
export type SeedProfile = 'demo' | 'weekly';

export function makeSeed(now: number, profile: SeedProfile = 'demo'): MockState {
  const demo = profile === 'demo';
  const tz = DEFAULT_TZ;
  const today = localDate(now, tz);
  const s: MockState = {
    version: MOCK_VERSION, users: {}, accounts: {}, authAttempts: {}, resetTokens: {}, squads: {}, goals: {}, checkins: {}, penalties: {}, feed: [], cashouts: {}, withdrawals: {}, donations: {},
    botThreads: {}, pendingActions: {}, milestones: {}, msgTimes: {}, seedUserIds: [],
    demo: { nextPhotoFails: false, fakeLocation: null, timeOffsetMs: 0 }, seq: 1, rev: 1,
  };
  const squadId = 'squad_mhacks';
  s.squads[squadId] = {
    id: squadId, name: 'MHacks Crew', inviteCode: 'PIZZA6', poolGoalName: 'Pizza night', poolGoalCents: 6000,
    poolBalanceCents: 0, timezone: tz, relayLinked: false, charityId: 'food-bank', poolFullAt: null,
  };
  // Demo accounts come from demoUsers.json (usernames, passwords, security answers).
  for (const d of demoUsers.users) {
    const k = d.username;
    const u: User = { id: `seed_${k}`, name: d.firstName, avatar: d.avatar, squadId, balanceCents: 20000 };
    s.users[u.id] = u;
    s.seedUserIds.push(u.id);
    s.accounts[k] = {
      userId: u.id, username: k, email: d.email, firstName: d.firstName, lastName: d.lastName, passwordHash: hash(d.password),
      security: d.securityQuestions.map((qId, i) => ({ qId, answerHash: hash(d.securityAnswers[i]) })),
    };
  }
  // Kevin starts with a saved address and card so the profile has something to show. Everyone else starts empty.
  s.billing = {
    seed_kevin: {
      tier: 'free', // one goal fits the free plan, so a second one shows the upgrade pop-up
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
  const ALL = [0, 1, 2, 3, 4, 5, 6];
  const defs: Array<[string, string, string, number, number, number[], number, number, number[]]> = demo
    ? [
        ['kevin', 'Gym', 'goal-gym', 42.2762, -83.7357, ALL, 23 * 60 + 30, 500, [1, 3]],
        ['ana', 'Daily run', 'goal-run', 42.2780, -83.7382, ALL, 23 * 60, 500, []],
        ['leo', 'Practice guitar', 'goal-guitar', 42.2750, -83.7415, ALL, 22 * 60 + 30, 500, [0, 2, 4]],
        ['maya', 'Yoga', 'goal-yoga', 42.2762, -83.7357, ALL, 23 * 60 + 15, 500, [1]],
      ]
    : [
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
    // demo: today's deadline can still pass during the demo and flake the goal automatically
    if (demo && !deadlinePassed(g, now, tz)) g.lastEvaluatedDate = dateAddDays(today, -1);
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
  pen(demo ? 'seed_goal_2' : 'seed_goal_3', 3, 1500);

  const ev = (actor: string | null, kind: 'commit' | 'checkin' | 'flake' | 'bot' | 'milestone', text: string, ago: number) =>
    s.feed.push({ id: `seed_f_${s.feed.length}`, squadId, actorUserId: actor, kind, text, createdAt: now - ago });
  ev('seed_ana', 'checkin', `Ana kept her promise: ${demo ? 'Daily run' : 'Morning run'}. 6 days in a row 🔥`, 25 * 60_000);
  ev(null, 'bot', 'Leo flaked on "Practice guitar". $15 to the pool. The strings are lonely.', 3 * DAY);
  ev('seed_kevin', 'flake', 'Kevin flaked on "Gym". $20 to the pool.', 2 * DAY);
  ev('seed_maya', 'commit', 'Maya committed to Yoga. Brave.', 5 * DAY);
  if (demo) s.milestones['pool:squad_mhacks:6000:0.5'] = true; // seed pool is already past halfway
  s.feed.sort((a, b) => b.createdAt - a.createdAt);
  return s;
}
