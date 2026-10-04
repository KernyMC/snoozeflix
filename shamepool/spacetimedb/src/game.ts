// Squads, goals, check-ins, penalties, deadlines, feed, cash-outs and withdrawals.
// Ported 1:1 from web/src/data/mock/engine.ts; the money rules live here and run inside the database.
import {
  applyPenalty, availableToWithdraw, dateAddDays, deadlinePassed, formatCents, formatDistance, generateInviteCode, haversineM, isDueToday, isInside,
  LIMITS, localDate, localMinutes, MIN_WITHDRAW_CENTS, missedDates, nextPenaltyCents, normalizeInviteCode, penaltyKey, stakeBreakdown,
  validateGoalInput, validatePoolGoal, validateWithdrawal, WITHDRAW_COOLDOWN_DEMO_MS, WITHDRAW_COOLDOWN_REAL_MS, banKey, kickError, ownerFromFeed, goalLimit, goalsOverLimit,
} from './shared/logic';
import type { Cents, Goal, GoalInput, PhotoVerdict, Pos, Result, Wallet } from './shared/types';
import {
  cashoutOf, checkinOf, feedOf, goalOf, penaltyOf, squadOf, withdrawalOf,
  type CashoutRow, type CheckinRow, type GoalRow, type PenaltyRow, type SquadRow, type WithdrawalRow,
} from './shared/mappers';
import { botAnswer, brokeLine, hypeLine, photoRoast, roastLine } from './bot';
import { charityById } from './shared/charities';
import { donate, poolGoalLocked, syncPoolFull } from './charity';
import { type Ctx, type Env, enqueue, err, meOf, ok, pushFeed, squadMembers, tzOfSquad, uid } from './core';

const STALE_CHECKIN_MS = 3 * 3600_000;
const GRACE_MIN = 10;
const WITHDRAW_DESTINATION = 'Capital One ••••4821';
export const AI_NOT_CONNECTED = 'AI check not connected';

const hash = (str: string) => [...str].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) | 0, 7);

/* ---------- squads ---------- */
export function createSquad(env: Env, input: { name: string; poolGoalName: string; poolGoalCents: number }): Result<ReturnType<typeof squadOf>> {
  const c = env.ctx;
  const me = meOf(env);
  if (!me) return err('no_user');
  if (me.squadId) return err('already_in_squad');
  if (input.name.trim().length < 1 || input.name.trim().length > 30) return err('invalid_name');
  if (input.poolGoalName.trim().length < 1 || input.poolGoalName.trim().length > 30) return err('invalid_name');
  const amt = validatePoolGoal(input.poolGoalCents);
  if (amt) return err(amt);
  let code = generateInviteCode(() => c.random());
  while ([...c.db.squad.inviteCode.filter(code)].length > 0) code = generateInviteCode(() => c.random()); // E11
  const row: SquadRow = {
    id: uid(env, 'sq'), name: input.name.trim(), inviteCode: code, poolGoalName: input.poolGoalName.trim(), poolGoalCents: input.poolGoalCents,
    poolBalanceCents: 0, timezone: 'America/Detroit', relayLinked: false,
  };
  c.db.squad.insert(row);
  c.db.squadOwner.insert({ squadId: row.id, userId: me.id });
  c.db.user.id.update({ ...me, squadId: row.id });
  enqueue(c, 'nessie_create_pool', `pool:${row.id}`, { squadId: row.id, squadName: row.name });
  pushFeed(env, row.id, me.id, 'commit', `${me.name} started the squad "${row.name}". Goal: ${row.poolGoalName}.`, env.now);
  return ok(squadOf(row));
}

export function joinSquad(env: Env, rawCode: string): Result<ReturnType<typeof squadOf>> {
  const c = env.ctx;
  const me = meOf(env);
  if (!me) return err('no_user');
  if (me.squadId) return err('already_in_squad');
  const code = normalizeInviteCode(rawCode);
  const squad = [...c.db.squad.inviteCode.filter(code)][0];
  if (!squad) return err('invalid_code');
  if (c.db.squadBan.key.find(banKey(squad.id, me.id))) return err('kicked_from_squad');
  if (squadMembers(c, squad.id).length >= LIMITS.maxSquadSize) return err('squad_full');
  c.db.user.id.update({ ...me, squadId: squad.id });
  pushFeed(env, squad.id, me.id, 'commit', `${me.name} joined the squad. Fresh money!`, env.now);
  return ok(squadOf(squad));
}

/** Pauses the goals a user has beyond their plan's limit (newest first). Returns how many were paused. */
export function enforceGoalLimit(c: Ctx, userId: string): number {
  const extra = goalsOverLimit([...c.db.goal.userId.filter(userId)], goalLimit(c.db.billingPlan.userId.find(userId)?.tier));
  for (const g of extra) c.db.goal.id.update({ ...g, active: false });
  return extra.length;
}

/** The squad's owner: the stored row, or (older squads) the author of its "started the squad" feed event. */
export function ownerOf(c: Ctx, squadId: string): string | null {
  return c.db.squadOwner.squadId.find(squadId)?.userId ?? ownerFromFeed([...c.db.feedEvent.squadId.filter(squadId)].map((f) => ({ ...f, actorUserId: f.actorUserId || null })));
}

/** Stores the owner of every squad that has none yet (derived from its feed). Idempotent; run once after this table was added. */
export function backfillOwners(c: Ctx): number {
  let n = 0;
  for (const sq of [...c.db.squad.iter()]) {
    if (c.db.squadOwner.squadId.find(sq.id)) continue;
    const owner = sq.id === 'squad_mhacks' ? 'seed_kevin' : ownerOf(c, sq.id);
    if (owner && c.db.user.id.find(owner)) { c.db.squadOwner.insert({ squadId: sq.id, userId: owner }); n++; }
  }
  return n;
}

/**
 * The owner removes a member (port of mock kickMember). Their balance and pending withdrawals stay theirs, what they
 * already paid into the pool stays with the squad, their goals stop (no more charges into a squad they left), an open
 * check-in fails, a cash-out they proposed is cancelled and an open vote is re-counted. They cannot rejoin with the code.
 */
export function kickMember(env: Env, userId: string) {
  const c = env.ctx;
  const me = meOf(env);
  const target = c.db.user.id.find(userId);
  const meLite = me ? { id: me.id, squadId: me.squadId || null } : null;
  const bad = kickError(meLite, me?.squadId ? ownerOf(c, me.squadId) : null, target ? { id: target.id, squadId: target.squadId || null } : null);
  if (bad || !me || !target) return err(bad ?? 'member_not_found');
  const squadId = me.squadId;
  c.db.user.id.update({ ...target, squadId: '' });
  for (const g of [...c.db.goal.userId.filter(target.id)]) if (g.squadId === squadId && g.active) c.db.goal.id.update({ ...g, active: false });
  for (const ck of [...c.db.checkin.userId.filter(target.id)]) if (ck.status === 'in_progress') c.db.checkin.id.update({ ...ck, status: 'failed' });
  for (const p of [...c.db.cashout.squadId.filter(squadId)]) {
    if (p.status === 'open' && p.proposerUserId === target.id) c.db.cashout.id.update({ ...p, status: 'cancelled' });
  }
  const k = banKey(squadId, target.id);
  if (!c.db.squadBan.key.find(k)) c.db.squadBan.insert({ key: k });
  pushFeed(env, squadId, me.id, 'commit', `${me.name} removed ${target.name} from the squad. What they paid stays in the pool.`, env.now);
  const open = openProposal(c, squadId);
  if (open) resolveVotes(env, open.id); // fewer members: the vote may be decided now
  return ok(true);
}

/* ---------- goals ---------- */
export function createGoal(env: Env, input: GoalInput): Result<Goal> {
  const c = env.ctx;
  const me = meOf(env);
  if (!me) return err('no_user');
  if (!me.squadId) return err('not_in_squad');
  const bad = validateGoalInput(input);
  if (bad) return err(bad);
  const active = [...c.db.goal.userId.filter(me.id)].filter((g) => g.active).length;
  const tier = c.db.billingPlan.userId.find(me.id)?.tier ?? 'free';
  if (active >= Math.min(LIMITS.maxGoalsPerUser, goalLimit(tier))) return err(tier === 'paid' ? 'too_many_goals' : 'upgrade_required');
  const tz = tzOfSquad(c, me.squadId);
  const row: GoalRow & { days: number[] } = {
    id: uid(env, 'g'), userId: me.id, squadId: me.squadId, title: input.title.trim(), emoji: input.emoji || 'goal-target', lat: input.lat, lng: input.lng,
    radiusM: input.radiusM, days: [...new Set(input.daysOfWeek)].sort(), deadlineMinutes: input.deadlineMinutes, minStayMinutes: input.minStayMinutes,
    basePenaltyCents: input.basePenaltyCents, maxPenaltyCents: input.maxPenaltyCents, consecutiveFlakes: 0, streak: 0, active: true, createdAt: env.now,
    lastEvaluatedDate: dateAddDays(localDate(env.now, tz), -1),
  };
  c.db.goal.insert(row);
  pushFeed(env, me.squadId, me.id, 'commit', `${me.name} committed to "${row.title}". Miss it and it costs ${formatCents(row.basePenaltyCents)}.`, env.now);
  return ok(goalOf(row));
}

export function updateGoalPenalty(env: Env, goalId: string, baseCents: number): Result<Goal> {
  const c = env.ctx;
  const me = meOf(env);
  if (!me) return err('no_user');
  const g = c.db.goal.id.find(goalId);
  if (!g) return err('goal_not_found');
  if (g.userId !== me.id) return err('not_your_goal');
  if (!Number.isInteger(baseCents) || baseCents < LIMITS.penaltyMin || baseCents > g.maxPenaltyCents) return err('invalid_penalty');
  const row = { ...g, basePenaltyCents: baseCents }; // G12: future penalties only
  c.db.goal.id.update(row);
  pushFeed(env, g.squadId, me.id, 'commit', `${me.name} raised the stakes on "${g.title}" to ${formatCents(baseCents)}.`, env.now);
  return ok(goalOf(row));
}

/* ---------- check-in ---------- */
const checkinFor = (c: Ctx, goalId: string, date: string): CheckinRow | undefined =>
  [...c.db.checkin.goalId.filter(goalId)].find((x) => x.localDate === date);

function ownGoal(env: Env, goalId: string): Result<{ me: NonNullable<ReturnType<typeof meOf>>; goal: GoalRow; tz: string }> {
  const me = meOf(env);
  if (!me) return err('no_user');
  const goal = env.ctx.db.goal.id.find(goalId);
  if (!goal) return err('goal_not_found');
  if (goal.userId !== me.id) return err('not_your_goal');
  return ok({ me, goal, tz: tzOfSquad(env.ctx, goal.squadId) });
}

export function startCheckin(env: Env, goalId: string, pos: Pos) {
  const c = env.ctx;
  const r = ownGoal(env, goalId);
  if (!r.ok) return r;
  const { me, goal, tz } = r.data;
  const g = goalOf(goal);
  const today = localDate(env.now, tz);
  if (!goal.active || !isDueToday(g, env.now, tz)) return err('not_due_today');
  let existing = checkinFor(c, goal.id, today);
  if (existing?.status === 'completed') return err('already_done');
  if (c.db.penalty.key.find(penaltyKey(goal.id, today))) return err('already_flaked');
  if (!Number.isFinite(pos.lat) || !Number.isFinite(pos.lng)) return err('invalid_location');
  if (existing?.status === 'in_progress' && env.now - existing.startedAt > STALE_CHECKIN_MS) { // C12
    existing = { ...existing, status: 'failed' };
    c.db.checkin.id.update(existing);
  }
  const resuming = existing?.status === 'in_progress';
  if (!resuming && deadlinePassed(g, env.now, tz)) return err('deadline_passed');
  if (existing && existing.attempts >= LIMITS.maxPhotoAttempts && existing.status === 'failed') return err('too_many_attempts');
  const dist = haversineM(g, pos);
  if (!isInside(g, pos)) return err('too_far', { distanceM: dist, label: formatDistance(dist) });
  if (existing && existing.status === 'in_progress') {
    const row = { ...existing, lastDistanceM: dist, lastPingAt: env.now };
    c.db.checkin.id.update(row);
    return ok(checkinOf(row)); // C9: resume
  }
  if (existing) {
    const row = { ...existing, status: 'in_progress', startedAt: env.now, lastDistanceM: dist, lastPingAt: env.now };
    c.db.checkin.id.update(row);
    return ok(checkinOf(row));
  }
  const row: CheckinRow = {
    id: uid(env, 'ci'), goalId: goal.id, userId: me.id, squadId: goal.squadId, localDate: today, status: 'in_progress', startedAt: env.now,
    lastDistanceM: dist, lastPingAt: env.now, attempts: 0, aiState: '', aiReason: '', aiRoast: '',
  };
  c.db.checkin.insert(row);
  return ok(checkinOf(row));
}

export function pingCheckin(env: Env, checkinId: string, pos: Pos) {
  const c = env.ctx;
  const ck = c.db.checkin.id.find(checkinId);
  if (!ck || ck.userId !== env.userId) return err('checkin_not_found');
  if (ck.status !== 'in_progress') return err('checkin_not_found');
  const goal = c.db.goal.id.find(ck.goalId);
  if (!goal) return err('goal_not_found');
  const dist = haversineM(goal, pos);
  if (!isInside(goal, pos)) {
    c.db.checkin.id.update({ ...ck, lastDistanceM: dist, lastPingAt: env.now, status: 'failed' });
    return err('left_area', { distanceM: dist });
  }
  const row = { ...ck, lastDistanceM: dist, lastPingAt: env.now };
  c.db.checkin.id.update(row);
  return ok(checkinOf(row));
}

/**
 * Photo bytes never reach the module: the client sends only the size and a fingerprint. The AI verdict is a TODO hook,
 * so a finished check-in is recorded with aiVerified=false and the reason "AI check not connected".
 */
/**
 * `ai`: undefined = no AI in this client (accepted as "AI check not connected"), null = the AI route failed (accepted
 * once per check-in, flagged, then `ai_unavailable`), a verdict = what /api/ai/verify-photo answered. Same rules as mock.
 */
export function finishCheckin(env: Env, checkinId: string, photoLen: number, ai?: PhotoVerdict | null) {
  const c = env.ctx;
  const ck = c.db.checkin.id.find(checkinId);
  if (!ck || ck.userId !== env.userId) return err('checkin_not_found');
  const goal = c.db.goal.id.find(ck.goalId);
  if (!goal) return err('goal_not_found');
  if (ck.status === 'completed') { // C19: idempotent
    return ok<{ checkin: ReturnType<typeof checkinOf>; verdict: PhotoVerdict }>({
      checkin: checkinOf(ck), verdict: { verified: true, confidence: 0.9, reason: ck.aiReason || 'Verified', roast: null },
    });
  }
  if (ck.status === 'failed') return err(ck.attempts >= LIMITS.maxPhotoAttempts ? 'too_many_attempts' : 'left_area');
  const me = c.db.user.id.find(ck.userId)!;
  const tz = tzOfSquad(c, goal.squadId);
  if (!Number.isFinite(photoLen) || photoLen < 8) return err('invalid_photo');
  const secondsLeft = Math.ceil((goal.minStayMinutes * 60_000 - (env.now - ck.startedAt)) / 1000);
  if (secondsLeft > 0) return err('too_early', { secondsLeft });
  // C20: started before the deadline → 10 min grace
  if (localDate(env.now, tz) !== ck.localDate || localMinutes(env.now, tz) > goal.deadlineMinutes + GRACE_MIN) return err('deadline_passed');

  if (ai === null) { // AI check unavailable: accept once per check-in (flagged), then ask for a retry
    const k = `aiunavail:${ck.id}`;
    if (c.db.milestone.key.find(k)) return err('ai_unavailable');
    c.db.milestone.insert({ key: k });
  }
  const attempts = ck.attempts + 1;
  const flags = c.db.demoFlags.id.find(0);
  const forced = !!flags?.nextPhotoFails;
  if (forced && flags) c.db.demoFlags.id.update({ ...flags, nextPhotoFails: false });
  const aiOk = ai
    ? { ...ai, confidence: Math.max(0, Math.min(1, Number(ai.confidence) || 0.7)), reason: String(ai.reason ?? '').slice(0, 120), roast: ai.roast ? String(ai.roast).slice(0, 140) : null }
    : null;
  const rejection: PhotoVerdict | null = forced
    ? { verified: false, confidence: 0.92, reason: 'Not the right place', roast: photoRoast(hash(ck.id) + attempts) }
    : aiOk && !aiOk.verified
      ? { ...aiOk, verified: false, reason: aiOk.reason || 'Not the right place', roast: aiOk.roast ?? photoRoast(hash(ck.id) + attempts) }
      : null;
  if (rejection) {
    const verdict = rejection;
    const base = { ...ck, attempts, aiState: 'no', aiReason: verdict.reason, aiRoast: verdict.roast ?? '' };
    if (attempts >= LIMITS.maxPhotoAttempts) {
      c.db.checkin.id.update({ ...base, status: 'failed' });
      return err('too_many_attempts', { verdict });
    }
    c.db.checkin.id.update(base);
    return err('photo_rejected', { verdict, attemptsLeft: LIMITS.maxPhotoAttempts - attempts });
  }
  const verdict: PhotoVerdict = aiOk
    ? { verified: true, confidence: aiOk.confidence, reason: aiOk.reason || 'Looks right', roast: null }
    : ai === null
      ? { verified: true, confidence: 0.5, reason: 'AI check unavailable', roast: null }
      : { verified: true, confidence: 0, reason: AI_NOT_CONNECTED, roast: null };
  const done = { ...ck, attempts, status: 'completed', aiState: aiOk ? 'yes' : 'no', aiReason: verdict.reason, aiRoast: '' };
  c.db.checkin.id.update(done);
  const streak = goal.streak + 1;
  c.db.goal.id.update({ ...goal, streak, consecutiveFlakes: 0 });
  pushFeed(env, goal.squadId, me.id, 'checkin', `${me.name} kept their promise: ${goal.title}. ${streak} in a row \u{1F525}`, env.now);
  const hype = hypeLine(streak);
  const key = `streak:${goal.id}:${streak}`;
  if (hype && !c.db.milestone.key.find(key)) {
    c.db.milestone.insert({ key });
    pushFeed(env, goal.squadId, null, 'bot', `${me.name}: ${hype}`, env.now);
  }
  return ok({ checkin: checkinOf(done), verdict });
}

/* ---------- penalties ---------- */
function checkPoolMilestones(env: Env, squadId: string): void {
  const c = env.ctx;
  const squad = c.db.squad.id.find(squadId);
  if (!squad || squad.poolGoalCents <= 0) return;
  const pct = squad.poolBalanceCents / squad.poolGoalCents;
  const marks: [number, string][] = [
    [0.5, `Halfway to ${squad.poolGoalName}! \u{1F355}`],
    [1, `Pool is full! ${squad.poolGoalName} is on. Time to cash out \u{1F389}`],
  ];
  for (const [mark, text] of marks) {
    const key = `pool:${squad.id}:${squad.poolGoalCents}:${mark}`;
    if (pct >= mark && !c.db.milestone.key.find(key)) {
      c.db.milestone.insert({ key });
      pushFeed(env, squad.id, null, 'milestone', text, env.now);
    }
  }
}

/** Idempotent by penalty key (goalId:localDate). Charges at most the balance, moves it to the pool, queues the Nessie transfer. */
export function applyFlake(env: Env, goal: GoalRow, date: string): PenaltyRow {
  const c = env.ctx;
  const key = penaltyKey(goal.id, date);
  const existing = c.db.penalty.key.find(key);
  if (existing) return existing; // P1
  const user = c.db.user.id.find(goal.userId)!;
  const squad = c.db.squad.id.find(goal.squadId)!;
  const intended = nextPenaltyCents(goal);
  const { charged, shortfall } = applyPenalty(user.balanceCents, intended);
  c.db.user.id.update({ ...user, balanceCents: user.balanceCents - charged });
  c.db.squad.id.update({ ...squad, poolBalanceCents: squad.poolBalanceCents + charged });
  c.db.goal.id.update({
    ...goal, consecutiveFlakes: goal.consecutiveFlakes + 1, streak: 0, lastEvaluatedDate: date > goal.lastEvaluatedDate ? date : goal.lastEvaluatedDate,
  });
  const pen: PenaltyRow = {
    id: uid(env, 'p'), key, goalId: goal.id, userId: user.id, squadId: squad.id, localDate: date, amountCents: charged, intendedCents: intended,
    shortfallCents: shortfall, status: 'charged', createdAt: env.now, nessieTransferId: '',
  };
  c.db.penalty.insert(pen);
  if (charged > 0) {
    enqueue(c, 'nessie_transfer', `penalty:${pen.id}`, { penaltyId: pen.id, userId: user.id, squadId: squad.id, amountCents: charged });
  }
  const ck = checkinFor(c, goal.id, date);
  if (ck && ck.status === 'in_progress') c.db.checkin.id.update({ ...ck, status: 'failed' });
  pushFeed(env, squad.id, user.id, 'flake', `${user.name} flaked on "${goal.title}". ${formatCents(charged)} to the pool.`, env.now, { penaltyId: pen.id, amountCents: charged });
  const n = hash(pen.id);
  pushFeed(env, squad.id, null, 'bot',
    shortfall > 0 && charged === 0 ? `${user.name} owes ${formatCents(intended)} but has $0. ${brokeLine(n)}` : `${user.name}: ${roastLine(n)}`, env.now);
  checkPoolMilestones(env, squad.id);
  syncPoolFull(env, squad.id);
  return pen;
}

export function forceFlake(env: Env, goalId: string) {
  const c = env.ctx;
  if (!env.demoMode) return err('unknown'); // demo only
  const me = meOf(env);
  if (!me) return err('no_user');
  const goal = c.db.goal.id.find(goalId);
  if (!goal) return err('goal_not_found');
  if (goal.userId !== me.id) return err('not_your_goal'); // M7: never flake a friend's goal
  if (!goal.active) return err('goal_not_found');
  const date = localDate(env.now, tzOfSquad(c, goal.squadId));
  const existing = c.db.penalty.key.find(penaltyKey(goal.id, date));
  if (existing) return ok(penaltyOf(existing));
  if (checkinFor(c, goal.id, date)?.status === 'completed') return err('already_done');
  return ok(penaltyOf(applyFlake(env, goal, date)));
}

/** Scheduler tick body: flake every goal with missed dates (catching up, respecting the grace window) and settle withdrawals. */
export function evaluateDeadlines(env: Env): number {
  const c = env.ctx;
  let flaked = 0;
  for (const goal of [...c.db.goal.iter()]) {
    if (!goal.active) continue;
    const tz = tzOfSquad(c, goal.squadId);
    const today = localDate(env.now, tz);
    const dates = missedDates(goalOf(goal), env.now, tz);
    let lastHandled: string | null = null;
    for (const d of dates) {
      const ck = checkinFor(c, goal.id, d);
      if (ck?.status === 'completed') { lastHandled = d; continue; }
      if (c.db.penalty.key.find(penaltyKey(goal.id, d))) { lastHandled = d; continue; }
      const inGrace = d === today && ck?.status === 'in_progress' && localMinutes(env.now, tz) <= goal.deadlineMinutes + GRACE_MIN;
      if (inGrace) break;
      applyFlake(env, c.db.goal.id.find(goal.id)!, d);
      flaked++;
      lastHandled = d;
    }
    const fresh = c.db.goal.id.find(goal.id);
    if (fresh && lastHandled && lastHandled > fresh.lastEvaluatedDate) c.db.goal.id.update({ ...fresh, lastEvaluatedDate: lastHandled });
  }
  return flaked;
}

/* ---------- feed ---------- */
export function postMessage(env: Env, text: string) {
  const c = env.ctx;
  const me = meOf(env);
  if (!me) return err('no_user');
  if (!me.squadId) return err('not_in_squad');
  const t = text.trim();
  if (t.length < 1 || t.length > LIMITS.messageMax) return err('invalid_message');
  const rate = c.db.msgRate.userId.find(me.id);
  let prior: number[] = [];
  try { prior = rate ? (JSON.parse(rate.timesJson) as number[]) : []; } catch { prior = []; }
  const times = prior.filter((x) => env.now - x < 10_000);
  if (times.length >= 5) return err('rate_limited');
  const row = { userId: me.id, timesJson: JSON.stringify([...times, env.now]) };
  if (rate) c.db.msgRate.userId.update(row); else c.db.msgRate.insert(row);
  pushFeed(env, me.squadId, me.id, 'message', t, env.now);
  const posted = [...c.db.feedEvent.squadId.filter(me.squadId)].filter((f) => f.actorUserId === me.id && f.kind === 'message')
    .sort((a, b) => b.seq - a.seq)[0];
  if (/@squadbot/i.test(t)) {
    const a = botAnswer(env, me.id, t);
    pushFeed(env, me.squadId, null, 'bot', a.text, env.now + 1);
  }
  return ok(feedOf(posted));
}

/* ---------- pool / cash-out ---------- */
export function setPoolGoal(env: Env, name: string, cents: number) {
  const c = env.ctx;
  const me = meOf(env);
  if (!me?.squadId) return err('not_in_squad');
  if (name.trim().length < 1 || name.trim().length > 30) return err('invalid_name');
  const bad = validatePoolGoal(cents);
  if (bad) return err(bad);
  const sq = c.db.squad.id.find(me.squadId)!;
  if (poolGoalLocked(c, sq.id)) return err('goal_locked'); // no stalling the charity clock
  const row = { ...sq, poolGoalName: name.trim(), poolGoalCents: cents };
  c.db.squad.id.update(row);
  pushFeed(env, sq.id, me.id, 'commit', `New pool goal: ${row.poolGoalName} (${formatCents(cents)}).`, env.now);
  checkPoolMilestones(env, sq.id);
  syncPoolFull(env, sq.id);
  return ok(squadOf(row));
}

const openProposal = (c: Ctx, squadId: string) => [...c.db.cashout.squadId.filter(squadId)].find((p) => p.status === 'open');
const votesOf = (c: Ctx, id: string) => [...c.db.cashoutVote.proposalId.filter(id)];

export function proposeCashout(env: Env, merchant: string) {
  const c = env.ctx;
  const me = meOf(env);
  if (!me?.squadId) return err('not_in_squad');
  const sq = c.db.squad.id.find(me.squadId)!;
  if (sq.poolBalanceCents < sq.poolGoalCents) return err('pool_not_ready');
  if (openProposal(c, sq.id)) return err('proposal_open');
  const p: CashoutRow = {
    id: uid(env, 'co'), squadId: sq.id, proposerUserId: me.id, merchantName: merchant.trim().slice(0, 30) || 'Pizza House', amountCents: sq.poolGoalCents,
    status: 'open', createdAt: env.now, nessiePurchaseId: '',
  };
  c.db.cashout.insert(p);
  c.db.cashoutVote.insert({ id: `${p.id}:${me.id}`, proposalId: p.id, squadId: sq.id, userId: me.id, approve: true });
  pushFeed(env, sq.id, me.id, 'cashout', `${me.name} proposed spending ${formatCents(p.amountCents)} at ${p.merchantName}. Vote!`, env.now);
  return resolveVotes(env, p.id);
}

export function resolveVotes(env: Env, proposalId: string) {
  const c = env.ctx;
  const p = c.db.cashout.id.find(proposalId)!;
  const sq = c.db.squad.id.find(p.squadId)!;
  const members = squadMembers(c, sq.id);
  const n = members.length;
  const memberIds = new Set(members.map((m) => m.id));
  const votes = votesOf(c, p.id).filter((v) => memberIds.has(v.userId));
  const yes = votes.filter((v) => v.approve).length;
  const no = votes.filter((v) => !v.approve).length;
  let cur = p;
  if (yes * 2 > n) {
    if (sq.poolBalanceCents < p.amountCents) return err('pool_changed'); // X6
    cur = { ...p, status: 'paid' };
    c.db.cashout.id.update(cur);
    const don = c.db.cashoutDonate.cashoutId.find(p.id);
    if (don) {
      donate(env, sq.id, 'vote', p.amountCents, charityById(don.charityId).id);
    } else {
      c.db.squad.id.update({ ...sq, poolBalanceCents: sq.poolBalanceCents - p.amountCents });
      enqueue(c, 'nessie_purchase', `cashout:${p.id}`, { cashoutId: p.id, squadId: sq.id, merchantName: p.merchantName, amountCents: p.amountCents });
      pushFeed(env, sq.id, null, 'cashout', `Approved! ${formatCents(p.amountCents)} spent at ${p.merchantName} \u{1F355}\u{1F389}`, env.now);
      syncPoolFull(env, sq.id);
    }
  } else if (no * 2 > n) {
    cur = { ...p, status: 'rejected' };
    c.db.cashout.id.update(cur);
    pushFeed(env, sq.id, null, 'cashout', `The squad said no to ${p.merchantName}. Democracy hurts.`, env.now);
  }
  return ok(cashoutOf(cur, votesOf(c, p.id)));
}

export function voteCashout(env: Env, proposalId: string, approve: boolean) {
  const c = env.ctx;
  const me = meOf(env);
  if (!me?.squadId) return err('not_in_squad');
  const p = c.db.cashout.id.find(proposalId);
  if (!p || p.status !== 'open') return err('proposal_not_found');
  if (p.squadId !== me.squadId) return err('not_in_squad');
  const id = `${p.id}:${me.id}`; // X3: latest vote wins
  const row = { id, proposalId: p.id, squadId: p.squadId, userId: me.id, approve };
  if (c.db.cashoutVote.id.find(id)) c.db.cashoutVote.id.update(row); else c.db.cashoutVote.insert(row);
  return resolveVotes(env, p.id);
}

export function cancelCashout(env: Env, proposalId: string) {
  const c = env.ctx;
  const me = meOf(env);
  if (!me) return err('no_user');
  const p = c.db.cashout.id.find(proposalId);
  if (!p || p.status !== 'open' || p.proposerUserId !== me.id) return err('proposal_not_found');
  const row = { ...p, status: 'cancelled' };
  c.db.cashout.id.update(row);
  return ok(cashoutOf(row, votesOf(c, p.id)));
}

/* ---------- wallet / withdrawals ---------- */
export const cooldownMs = (env: Env): number => (env.demoMode ? WITHDRAW_COOLDOWN_DEMO_MS : WITHDRAW_COOLDOWN_REAL_MS);

export function walletOf(env: Env, userId: string): Wallet {
  const c = env.ctx;
  const user = c.db.user.id.find(userId);
  const tz = tzOfSquad(c, user?.squadId || null);
  const today = localDate(env.now, tz);
  const goals = [...c.db.goal.userId.filter(userId)].filter((g) => g.active).map(goalOf);
  const handled = (goalId: string) => checkinFor(c, goalId, today)?.status === 'completed' || !!c.db.penalty.key.find(penaltyKey(goalId, today));
  const stake = stakeBreakdown(goals, env.now, tz, handled);
  const stakeCents = stake.reduce((a, x) => a + x.cents, 0);
  const pendingCents = [...c.db.withdrawal.userId.filter(userId)].filter((w) => w.status === 'pending').reduce((a, w) => a + w.amountCents, 0);
  const balanceCents = user?.balanceCents ?? 0;
  return {
    balanceCents, stakeCents, availableCents: availableToWithdraw(balanceCents, stakeCents), pendingCents, stake,
    minWithdrawCents: MIN_WITHDRAW_CENTS, cooldownMs: cooldownMs(env),
  };
}

export function requestWithdrawal(env: Env, amountCents: Cents) {
  const c = env.ctx;
  const me = meOf(env);
  if (!me) return err('no_user');
  if (!me.squadId) return err('not_in_squad');
  if (!Number.isInteger(amountCents) || amountCents <= 0) return err('invalid_amount');
  if ([...c.db.withdrawal.userId.filter(me.id)].some((w) => w.status === 'pending')) return err('withdrawal_pending');
  const wallet = walletOf(env, me.id);
  const bad = validateWithdrawal(amountCents, wallet.availableCents);
  if (bad) return err(bad, { availableCents: wallet.availableCents, stakeCents: wallet.stakeCents, minCents: MIN_WITHDRAW_CENTS });
  c.db.user.id.update({ ...me, balanceCents: me.balanceCents - amountCents }); // escrow
  const w: WithdrawalRow = {
    id: uid(env, 'w'), userId: me.id, squadId: me.squadId, amountCents, status: 'pending', destination: WITHDRAW_DESTINATION, createdAt: env.now,
    availableAt: env.now + cooldownMs(env), nessieWithdrawalId: '',
  };
  c.db.withdrawal.insert(w);
  pushFeed(env, me.squadId, me.id, 'withdrawal', `${me.name} is withdrawing ${formatCents(amountCents)}. Cooling off...`, env.now, { withdrawalId: w.id });
  return ok(withdrawalOf(w));
}

export function cancelWithdrawal(env: Env, id: string) {
  const c = env.ctx;
  const me = meOf(env);
  if (!me) return err('no_user');
  const w = c.db.withdrawal.id.find(id);
  if (!w || w.userId !== me.id || w.status !== 'pending') return err('withdrawal_not_found');
  const row = { ...w, status: 'cancelled' };
  c.db.withdrawal.id.update(row);
  c.db.user.id.update({ ...me, balanceCents: me.balanceCents + w.amountCents });
  pushFeed(env, w.squadId, me.id, 'withdrawal', `${me.name} changed their mind and cancelled the withdrawal. Back in the game.`, env.now);
  return ok(withdrawalOf(row));
}

/** Scheduler: complete withdrawals whose cooling period ended, and queue the Nessie withdrawal. */
export function settleWithdrawals(env: Env): number {
  const c = env.ctx;
  let n = 0;
  for (const w of [...c.db.withdrawal.iter()]) {
    if (w.status !== 'pending' || env.now < w.availableAt) continue;
    c.db.withdrawal.id.update({ ...w, status: 'completed' });
    n++;
    const u = c.db.user.id.find(w.userId);
    enqueue(c, 'nessie_withdraw', `withdrawal:${w.id}`, { withdrawalId: w.id, userId: w.userId, amountCents: w.amountCents });
    pushFeed(env, w.squadId, u?.id ?? null, 'withdrawal', `${u?.name ?? 'Someone'} withdrew ${formatCents(w.amountCents)} to ${w.destination}.`, env.now);
  }
  return n;
}
