// Demo squad "MHacks Crew" (invite PIZZA6) with Kevin / Ana / Leo / Maya, goals and a week of history. Port of mock/seed.ts.
// Also wipes and reseeds (reset_demo). Nessie links and the outbox survive a reset so Nessie is not re-provisioned.
import { DEFAULT_TZ, dateAddDays, dowOfDate, localDate, normalizeInviteCode, penaltyKey } from './shared/logic';
import { normalizeAnswer } from './shared/authLogic';
import { secretHash } from './shared/sha256';
import { type Ctx, enqueue, envOf, pushFeed, realNowMs, type Env } from './core';
import { createUser } from './auth';

const DAY = 86_400_000;

function wipe(c: Ctx): void {
  for (const r of [...c.db.account.iter()]) c.db.account.key.delete(r.key);
  for (const r of [...c.db.authAttempt.iter()]) c.db.authAttempt.key.delete(r.key);
  for (const r of [...c.db.resetToken.iter()]) c.db.resetToken.key.delete(r.key);
  for (const r of [...c.db.session.iter()]) c.db.session.identity.delete(r.identity);
  for (const r of [...c.db.cashoutVote.iter()]) c.db.cashoutVote.id.delete(r.id);
  for (const r of [...c.db.cashout.iter()]) c.db.cashout.id.delete(r.id);
  for (const r of [...c.db.withdrawal.iter()]) c.db.withdrawal.id.delete(r.id);
  for (const r of [...c.db.penalty.iter()]) c.db.penalty.id.delete(r.id);
  for (const r of [...c.db.checkin.iter()]) c.db.checkin.id.delete(r.id);
  for (const r of [...c.db.goal.iter()]) c.db.goal.id.delete(r.id);
  for (const r of [...c.db.feedEvent.iter()]) c.db.feedEvent.id.delete(r.id);
  for (const r of [...c.db.user.iter()]) c.db.user.id.delete(r.id);
  for (const r of [...c.db.squad.iter()]) c.db.squad.id.delete(r.id);
  for (const r of [...c.db.squadOwner.iter()]) c.db.squadOwner.squadId.delete(r.squadId);
  for (const r of [...c.db.squadBan.iter()]) c.db.squadBan.key.delete(r.key);
  for (const r of [...c.db.squadCharity.iter()]) c.db.squadCharity.squadId.delete(r.squadId);
  for (const r of [...c.db.donation.iter()]) c.db.donation.id.delete(r.id);
  for (const r of [...c.db.cashoutDonate.iter()]) c.db.cashoutDonate.cashoutId.delete(r.cashoutId);
  for (const r of [...c.db.billingPlan.iter()]) c.db.billingPlan.userId.delete(r.userId);
  for (const r of [...c.db.address.iter()]) c.db.address.id.delete(r.id);
  for (const r of [...c.db.paymentMethod.iter()]) c.db.paymentMethod.id.delete(r.id);
  for (const r of [...c.db.botMessage.iter()]) c.db.botMessage.id.delete(r.id);
  for (const r of [...c.db.pendingAction.iter()]) c.db.pendingAction.id.delete(r.id);
  for (const r of [...c.db.msgRate.iter()]) c.db.msgRate.userId.delete(r.userId);
  for (const r of [...c.db.milestone.iter()]) c.db.milestone.key.delete(r.key);
}

/** Wipes everything except counters, the bridge, Nessie links and the outbox, then inserts the demo squad. */
export function seedDemo(c: Ctx, keepDemoMode = true): void {
  const old = c.db.demoFlags.id.find(0);
  const flags = { id: 0, demoMode: keepDemoMode && old ? old.demoMode : true, nextPhotoFails: false, timeOffsetMs: 0, fakeOn: false, fakeLat: 0, fakeLng: 0, fakeAcc: 0 };
  if (old) c.db.demoFlags.id.update(flags); else c.db.demoFlags.insert(flags);
  wipe(c);

  const now = realNowMs(c);
  const env: Env = envOf(c, null);
  const tz = DEFAULT_TZ;
  const today = localDate(now, tz);
  const squadId = 'squad_mhacks';
  c.db.squad.insert({
    id: squadId, name: 'MHacks Crew', inviteCode: normalizeInviteCode('PIZZA6'), poolGoalName: 'Pizza night', poolGoalCents: 6000, poolBalanceCents: 0,
    timezone: tz, relayLinked: false,
  });
  c.db.squadOwner.insert({ squadId, userId: 'seed_kevin' });
  enqueue(c, 'nessie_create_pool', `pool:${squadId}`, { squadId, squadName: 'MHacks Crew' });

  const people: [string, string, string][] = [
    ['kevin', 'Kevin', '/assets/avatar/01-coin-thief.png'], ['ana', 'Ana', '/assets/avatar/02-savings-buddy.png'],
    ['leo', 'Leo', '/assets/avatar/03-wallet-friend.png'], ['maya', 'Maya', '/assets/avatar/04-fist-bump.png'],
  ];
  for (const [k, name, avatar] of people) {
    createUser(env, name, avatar, { id: `seed_${k}`, isSeed: true, squadId });
    // Demo login: username = lowercase name, password "Password1", security answers all "demo".
    c.db.account.insert({
      key: k, userId: `seed_${k}`, username: k, email: `${k}@example.com`, firstName: name, lastName: 'Demo', passwordHash: secretHash(k, 'pw', 'Password1'),
      securityJson: JSON.stringify(['pet', 'city', 'car'].map((qId) => ({ qId, answerHash: secretHash(k, 'ans', normalizeAnswer('demo')) }))),
    });
  }
  // Kevin starts with a saved address and card; everyone else starts empty.
  c.db.address.insert({
    id: 'seed_addr_home', userId: 'seed_kevin', label: 'Home', fullName: 'Kevin Demo', line1: '123 Demo Street', line2: 'Apt 4', city: 'Ann Arbor', state: 'MI',
    zip: '48104', createdAt: now - 9 * DAY,
  });
  c.db.paymentMethod.insert({
    id: 'seed_pm_visa', userId: 'seed_kevin', nickname: 'Everyday Visa', nameOnCard: 'Kevin Demo', brand: 'visa', last4: '4242', expMonth: 9,
    expYear: new Date(now).getUTCFullYear() + 3, addressId: 'seed_addr_home', createdAt: now - 9 * DAY,
  });

  // [owner, title, icon key (stored in `emoji`), lat, lng, days, deadlineMin, penalty, skipIdx[]]
  const defs: [string, string, string, number, number, number[], number, number, number[]][] = [
    ['kevin', 'Gym', 'goal-gym', 42.2762, -83.7357, [1, 2, 3, 4, 5], 18 * 60, 500, [1, 3]],
    ['ana', 'Morning run', 'goal-run', 42.278, -83.7382, [1, 2, 3, 4, 5, 6], 9 * 60, 500, []],
    ['leo', 'Practice guitar', 'goal-guitar', 42.275, -83.7415, [1, 3, 5], 20 * 60, 500, [0]],
    ['maya', 'Yoga', 'goal-yoga', 42.2762, -83.7357, [2, 4, 6], 19 * 60, 500, []],
  ];
  let n = 0;
  for (const [owner, title, emoji, lat, lng, days, deadline, base, skip] of defs) {
    const id = `seed_goal_${n++}`;
    let idx = 0;
    let streak = 0;
    for (let i = 6; i >= 1; i--) {
      const d = dateAddDays(today, -i);
      if (!days.includes(dowOfDate(d))) continue;
      const missed = skip.includes(idx++);
      if (missed) { streak = 0; continue; }
      streak++;
      c.db.checkin.insert({
        id: `seed_ci_${id}_${d}`, goalId: id, userId: `seed_${owner}`, squadId, localDate: d, status: 'completed', startedAt: now - i * DAY, lastDistanceM: 20,
        lastPingAt: now - i * DAY, attempts: 1, aiState: 'yes', aiReason: '', aiRoast: '',
      });
    }
    c.db.goal.insert({
      id, userId: `seed_${owner}`, squadId, title, emoji, lat, lng, radiusM: 150, days, deadlineMinutes: deadline, minStayMinutes: 1, basePenaltyCents: base,
      maxPenaltyCents: 4000, consecutiveFlakes: id === 'seed_goal_0' ? 1 : 0, streak: id === 'seed_goal_0' ? 0 : streak, active: true, createdAt: now - 10 * DAY,
      lastEvaluatedDate: today,
    });
  }

  // Seeded history: money already moved, so no Nessie job is queued for these.
  const pen = (goalId: string, userId: string, offset: number, cents: number): void => {
    const date = dateAddDays(today, -offset);
    c.db.penalty.insert({
      id: `seed_pen_${goalId}_${offset}`, key: penaltyKey(goalId, date), goalId, userId, squadId, localDate: date, amountCents: cents, intendedCents: cents,
      shortfallCents: 0, status: 'charged', createdAt: now - offset * DAY, nessieTransferId: '',
    });
    const u = c.db.user.id.find(userId)!;
    c.db.user.id.update({ ...u, balanceCents: u.balanceCents - cents });
    const s = c.db.squad.id.find(squadId)!;
    c.db.squad.id.update({ ...s, poolBalanceCents: s.poolBalanceCents + cents });
  };
  pen('seed_goal_0', 'seed_kevin', 2, 2000);
  pen('seed_goal_3', 'seed_leo', 3, 1500);

  const ev = (actor: string | null, kind: string, text: string, ago: number) => pushFeed(env, squadId, actor, kind, text, now - ago);
  ev('seed_maya', 'commit', 'Maya committed to Yoga. Brave.', 5 * DAY);
  ev('seed_kevin', 'flake', 'Kevin flaked on "Gym". $20 to the pool.', 2 * DAY);
  ev(null, 'bot', 'Leo flaked on "Practice guitar". $15 to the pool. The strings are lonely.', 3 * 3600_000);
  ev('seed_ana', 'checkin', 'Ana kept her promise: Morning run. 6 days in a row \u{1F525}', 25 * 60_000);
}
