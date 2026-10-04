import {
  applyPenalty, buildLeaderboard, dateAddDays, deadlinePassed, formatCents, formatDistance, generateInviteCode, haversineM,
  isDueToday, isInside, LIMITS, localDate, localMinutes, missedDates, nextPenaltyCents, normalizeInviteCode, penaltyKey,
  validateGoalInput, validateName, validatePoolGoal,
} from '../logic';
import type {
  BotReply, CashoutProposal, Checkin, FeedEvent, Goal, GoalInput, PhotoVerdict, Penalty, Pos, Result, Squad, User,
} from '../types';
import { answer, brokeLine, hypeLine, photoRoast, roastLine } from './bot';
import { type Ctx, type MockState, err, ok, pushFeed, squadMembers, uid } from './state';

const STALE_CHECKIN_MS = 3 * 3600_000;
const GRACE_MIN = 10;
const ACTION_TTL_MS = 5 * 60_000;

function meOf(c: Ctx): User | null {
  return c.userId ? c.s.users[c.userId] ?? null : null;
}
function tzOf(s: MockState, squadId: string | null): string {
  return (squadId && s.squads[squadId]?.timezone) || 'America/Detroit';
}
const hash = (str: string) => [...str].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) | 0, 7);

/* ---------- identity / squad ---------- */
export function registerUser(c: Ctx, input: { name: string; avatar: string }): Result<User> {
  const bad = validateName(input.name);
  if (bad) return err(bad);
  const u: User = { id: uid(c.s, 'u'), name: input.name.trim(), avatar: input.avatar || '🙂', squadId: null, balanceCents: 20000 };
  c.s.users[u.id] = u;
  return ok(u);
}

export function claimSeedUser(c: Ctx, userId: string): Result<User> {
  if (!c.s.seedUserIds.includes(userId) || !c.s.users[userId]) return err('no_user');
  return ok(c.s.users[userId]);
}

export function createSquad(c: Ctx, input: { name: string; poolGoalName: string; poolGoalCents: number }): Result<Squad> {
  const me = meOf(c);
  if (!me) return err('no_user');
  if (me.squadId) return err('already_in_squad');
  if (input.name.trim().length < 1 || input.name.trim().length > 30) return err('invalid_name');
  if (input.poolGoalName.trim().length < 1 || input.poolGoalName.trim().length > 30) return err('invalid_name');
  const amt = validatePoolGoal(input.poolGoalCents);
  if (amt) return err(amt);
  const taken = new Set(Object.values(c.s.squads).map((q) => q.inviteCode));
  let code = generateInviteCode();
  while (taken.has(code)) code = generateInviteCode(); // E11
  const squad: Squad = {
    id: uid(c.s, 'sq'), name: input.name.trim(), inviteCode: code, poolGoalName: input.poolGoalName.trim(),
    poolGoalCents: input.poolGoalCents, poolBalanceCents: 0, timezone: 'America/Detroit', relayLinked: false,
  };
  c.s.squads[squad.id] = squad;
  me.squadId = squad.id;
  pushFeed(c.s, squad.id, me.id, 'commit', `${me.name} started the squad "${squad.name}". Goal: ${squad.poolGoalName}.`, c.now);
  return ok(squad);
}

export function joinSquad(c: Ctx, rawCode: string): Result<Squad> {
  const me = meOf(c);
  if (!me) return err('no_user');
  if (me.squadId) return err('already_in_squad');
  const code = normalizeInviteCode(rawCode);
  const squad = Object.values(c.s.squads).find((q) => q.inviteCode === code);
  if (!squad) return err('invalid_code');
  if (squadMembers(c.s, squad.id).length >= LIMITS.maxSquadSize) return err('squad_full');
  me.squadId = squad.id;
  pushFeed(c.s, squad.id, me.id, 'commit', `${me.name} joined the squad. Fresh money!`, c.now);
  return ok(squad);
}

/* ---------- goals ---------- */
export function createGoal(c: Ctx, input: GoalInput): Result<Goal> {
  const me = meOf(c);
  if (!me) return err('no_user');
  if (!me.squadId) return err('not_in_squad');
  const bad = validateGoalInput(input);
  if (bad) return err(bad);
  const active = Object.values(c.s.goals).filter((g) => g.userId === me.id && g.active).length;
  if (active >= LIMITS.maxGoalsPerUser) return err('too_many_goals');
  const tz = tzOf(c.s, me.squadId);
  const goal: Goal = {
    ...input, title: input.title.trim(), emoji: input.emoji || 'goal-target', daysOfWeek: [...new Set(input.daysOfWeek)].sort(),
    id: uid(c.s, 'g'), userId: me.id, squadId: me.squadId, consecutiveFlakes: 0, streak: 0, active: true,
    createdAt: c.now, lastEvaluatedDate: dateAddDays(localDate(c.now, tz), -1),
  };
  c.s.goals[goal.id] = goal;
  pushFeed(c.s, me.squadId, me.id, 'commit',
    `${me.name} committed to "${goal.title}". Miss it and it costs ${formatCents(goal.basePenaltyCents)}.`, c.now);
  return ok(goal);
}

export function updateGoalPenalty(c: Ctx, goalId: string, baseCents: number): Result<Goal> {
  const me = meOf(c);
  if (!me) return err('no_user');
  const g = c.s.goals[goalId];
  if (!g) return err('goal_not_found');
  if (g.userId !== me.id) return err('not_your_goal');
  if (!Number.isInteger(baseCents) || baseCents < LIMITS.penaltyMin || baseCents > g.maxPenaltyCents) return err('invalid_penalty');
  g.basePenaltyCents = baseCents; // G12: future penalties only
  pushFeed(c.s, g.squadId, me.id, 'commit', `${me.name} raised the stakes on "${g.title}" to ${formatCents(baseCents)}.`, c.now);
  return ok(g);
}

/* ---------- check-in ---------- */
function ownGoal(c: Ctx, goalId: string): Result<{ me: User; goal: Goal; tz: string }> {
  const me = meOf(c);
  if (!me) return err('no_user');
  const goal = c.s.goals[goalId];
  if (!goal) return err('goal_not_found');
  if (goal.userId !== me.id) return err('not_your_goal');
  return ok({ me, goal, tz: tzOf(c.s, goal.squadId) });
}
const checkinFor = (s: MockState, goalId: string, date: string) =>
  Object.values(s.checkins).find((x) => x.goalId === goalId && x.localDate === date);

export function startCheckin(c: Ctx, goalId: string, pos: Pos): Result<Checkin> {
  const r = ownGoal(c, goalId);
  if (!r.ok) return r;
  const { me, goal, tz } = r.data;
  const today = localDate(c.now, tz);
  if (!goal.active || !isDueToday(goal, c.now, tz)) return err('not_due_today');
  const existing = checkinFor(c.s, goal.id, today);
  if (existing?.status === 'completed') return err('already_done');
  if (c.s.penalties[penaltyKey(goal.id, today)]) return err('already_flaked');
  if (!Number.isFinite(pos.lat) || !Number.isFinite(pos.lng)) return err('invalid_location');
  if (existing?.status === 'in_progress' && c.now - existing.startedAt > STALE_CHECKIN_MS) existing.status = 'failed'; // C12
  const resuming = existing?.status === 'in_progress';
  if (!resuming && deadlinePassed(goal, c.now, tz)) return err('deadline_passed');
  if (existing && existing.attempts >= LIMITS.maxPhotoAttempts && existing.status === 'failed') return err('too_many_attempts');
  const dist = haversineM(goal, pos);
  if (!isInside(goal, pos)) return err('too_far', { distanceM: dist, label: formatDistance(dist) });
  if (existing?.status === 'in_progress') {
    existing.lastDistanceM = dist;
    existing.lastPingAt = c.now;
    return ok(existing); // C9: resume
  }
  const ck: Checkin = existing ?? {
    id: uid(c.s, 'ci'), goalId: goal.id, userId: me.id, localDate: today, status: 'in_progress', startedAt: c.now,
    lastDistanceM: dist, lastPingAt: c.now, attempts: 0,
  };
  ck.status = 'in_progress';
  ck.startedAt = c.now;
  ck.lastDistanceM = dist;
  ck.lastPingAt = c.now;
  ck.attempts = existing?.attempts ?? 0;
  c.s.checkins[ck.id] = ck;
  return ok(ck);
}

export function pingCheckin(c: Ctx, checkinId: string, pos: Pos): Result<Checkin> {
  const ck = c.s.checkins[checkinId];
  if (!ck || ck.userId !== c.userId) return err('checkin_not_found');
  if (ck.status !== 'in_progress') return err('checkin_not_found');
  const goal = c.s.goals[ck.goalId];
  if (!goal) return err('goal_not_found');
  const dist = haversineM(goal, pos);
  ck.lastDistanceM = dist;
  ck.lastPingAt = c.now;
  if (!isInside(goal, pos)) {
    ck.status = 'failed';
    return err('left_area', { distanceM: dist });
  }
  return ok(ck);
}

export function finishCheckin(c: Ctx, checkinId: string, photo: string): Result<{ checkin: Checkin; verdict: PhotoVerdict }> {
  const ck = c.s.checkins[checkinId];
  if (!ck || ck.userId !== c.userId) return err('checkin_not_found');
  const goal = c.s.goals[ck.goalId];
  if (!goal) return err('goal_not_found');
  if (ck.status === 'completed') {
    // C19: idempotent
    return ok({ checkin: ck, verdict: { verified: true, confidence: 0.9, reason: ck.aiReason ?? 'Verified', roast: null } });
  }
  if (ck.status === 'failed') return err(ck.attempts >= LIMITS.maxPhotoAttempts ? 'too_many_attempts' : 'left_area');
  const me = c.s.users[ck.userId];
  const tz = tzOf(c.s, goal.squadId);
  if (typeof photo !== 'string' || photo.length < 8) return err('invalid_photo');
  const secondsLeft = Math.ceil((goal.minStayMinutes * 60_000 - (c.now - ck.startedAt)) / 1000);
  if (secondsLeft > 0) return err('too_early', { secondsLeft });
  // C20: started before the deadline → 10 min grace
  if (localDate(c.now, tz) !== ck.localDate || localMinutes(c.now, tz) > goal.deadlineMinutes + GRACE_MIN) return err('deadline_passed');

  ck.attempts += 1;
  if (c.s.demo.nextPhotoFails) {
    c.s.demo.nextPhotoFails = false;
    const verdict: PhotoVerdict = { verified: false, confidence: 0.92, reason: 'Not the right place', roast: photoRoast(hash(ck.id) + ck.attempts) };
    ck.aiVerified = false; ck.aiReason = verdict.reason; ck.aiRoast = verdict.roast;
    if (ck.attempts >= LIMITS.maxPhotoAttempts) {
      ck.status = 'failed';
      return err('too_many_attempts', { verdict });
    }
    return err('photo_rejected', { verdict, attemptsLeft: LIMITS.maxPhotoAttempts - ck.attempts });
  }
  const verdict: PhotoVerdict = { verified: true, confidence: 0.94, reason: `Looks like a real ${goal.title.toLowerCase()} moment`, roast: null };
  ck.status = 'completed'; ck.aiVerified = true; ck.aiReason = verdict.reason; ck.aiRoast = null;
  goal.streak += 1;
  goal.consecutiveFlakes = 0;
  pushFeed(c.s, goal.squadId, me.id, 'checkin', `${me.name} kept their promise: ${goal.title}. ${goal.streak} in a row 🔥`, c.now);
  const hype = hypeLine(goal.streak);
  const key = `streak:${goal.id}:${goal.streak}`;
  if (hype && !c.s.milestones[key]) {
    c.s.milestones[key] = true;
    pushFeed(c.s, goal.squadId, null, 'bot', `${me.name}: ${hype}`, c.now);
  }
  return ok({ checkin: ck, verdict });
}

/* ---------- penalties ---------- */
function checkPoolMilestones(c: Ctx, squad: Squad): void {
  if (squad.poolGoalCents <= 0) return;
  const pct = squad.poolBalanceCents / squad.poolGoalCents;
  for (const [mark, text] of [[0.5, `Halfway to ${squad.poolGoalName}! 🍕`], [1, `Pool is full! ${squad.poolGoalName} is on. Time to cash out 🎉`]] as const) {
    const key = `pool:${squad.id}:${squad.poolGoalCents}:${mark}`;
    if (pct >= mark && !c.s.milestones[key]) {
      c.s.milestones[key] = true;
      pushFeed(c.s, squad.id, null, 'milestone', text, c.now);
    }
  }
}

export function applyFlake(c: Ctx, goal: Goal, date: string): Penalty {
  const key = penaltyKey(goal.id, date);
  const existing = c.s.penalties[key];
  if (existing) return existing; // P1: idempotent
  const user = c.s.users[goal.userId];
  const squad = c.s.squads[goal.squadId];
  const intended = nextPenaltyCents(goal);
  const { charged, shortfall } = applyPenalty(user.balanceCents, intended);
  user.balanceCents -= charged;
  squad.poolBalanceCents += charged;
  goal.consecutiveFlakes += 1;
  goal.streak = 0;
  if (date > goal.lastEvaluatedDate) goal.lastEvaluatedDate = date;
  const pen: Penalty = {
    id: uid(c.s, 'p'), goalId: goal.id, userId: user.id, squadId: squad.id, localDate: date, amountCents: charged,
    intendedCents: intended, shortfallCents: shortfall, status: 'charged', createdAt: c.now,
  };
  c.s.penalties[key] = pen;
  const ck = checkinFor(c.s, goal.id, date);
  if (ck && ck.status === 'in_progress') ck.status = 'failed';
  pushFeed(c.s, squad.id, user.id, 'flake', `${user.name} flaked on "${goal.title}". ${formatCents(charged)} to the pool.`, c.now,
    { penaltyId: pen.id, amountCents: charged });
  const n = hash(pen.id);
  pushFeed(c.s, squad.id, null, 'bot',
    shortfall > 0 && charged === 0 ? `${user.name} owes ${formatCents(intended)} but has $0. ${brokeLine(n)}` : `${user.name}: ${roastLine(n)}`, c.now);
  checkPoolMilestones(c, squad);
  return pen;
}

export function forceFlake(c: Ctx, goalId: string): Result<Penalty> {
  const me = meOf(c);
  if (!me) return err('no_user');
  const goal = c.s.goals[goalId];
  if (!goal) return err('goal_not_found');
  if (goal.squadId !== me.squadId) return err('not_in_squad');
  const date = localDate(c.now, tzOf(c.s, goal.squadId));
  const existing = c.s.penalties[penaltyKey(goal.id, date)];
  if (existing) return ok(existing);
  if (checkinFor(c.s, goal.id, date)?.status === 'completed') return err('already_done');
  return ok(applyFlake(c, goal, date));
}

/** Scheduler tick: flake every goal with missed dates, catching up and respecting the grace window. */
export function evaluateDeadlines(c: Ctx): Penalty[] {
  const out: Penalty[] = [];
  for (const goal of Object.values(c.s.goals)) {
    if (!goal.active) continue;
    const tz = tzOf(c.s, goal.squadId);
    const today = localDate(c.now, tz);
    const dates = missedDates(goal, c.now, tz);
    let lastHandled: string | null = null;
    for (const d of dates) {
      const ck = checkinFor(c.s, goal.id, d);
      if (ck?.status === 'completed') { lastHandled = d; continue; }
      if (c.s.penalties[penaltyKey(goal.id, d)]) { lastHandled = d; continue; }
      const inGrace = d === today && ck?.status === 'in_progress' && localMinutes(c.now, tz) <= goal.deadlineMinutes + GRACE_MIN;
      if (inGrace) break;
      out.push(applyFlake(c, goal, d));
      lastHandled = d;
    }
    if (lastHandled && lastHandled > goal.lastEvaluatedDate) goal.lastEvaluatedDate = lastHandled;
  }
  return out;
}

/* ---------- feed / bot ---------- */
export function postMessage(c: Ctx, text: string): Result<FeedEvent> {
  const me = meOf(c);
  if (!me) return err('no_user');
  if (!me.squadId) return err('not_in_squad');
  const t = text.trim();
  if (t.length < 1 || t.length > LIMITS.messageMax) return err('invalid_message');
  const times = (c.s.msgTimes[me.id] ?? []).filter((x) => c.now - x < 10_000);
  if (times.length >= 5) return err('rate_limited');
  c.s.msgTimes[me.id] = [...times, c.now];
  const ev = pushFeed(c.s, me.squadId, me.id, 'message', t, c.now);
  if (/@squadbot/i.test(t)) {
    const a = answer(c.s, me.id, t, c.now);
    pushFeed(c.s, me.squadId, null, 'bot', a.text, c.now + 1);
  }
  return ok(ev);
}

function addThread(c: Ctx, from: 'me' | 'bot', text: string, pendingAction?: BotReply['pendingAction']) {
  const uidv = c.userId as string;
  (c.s.botThreads[uidv] ??= []).push({ id: uid(c.s, 'm'), from, text, pendingAction, createdAt: c.now });
}

export function askBot(c: Ctx, text: string): Result<BotReply> {
  const me = meOf(c);
  if (!me) return err('no_user');
  const t = text.trim();
  if (t.length < 1 || t.length > LIMITS.messageMax) return err('invalid_message');
  addThread(c, 'me', t);
  const a = answer(c.s, me.id, t, c.now);
  let pendingAction: BotReply['pendingAction'];
  if (a.action) {
    pendingAction = { id: uid(c.s, 'act'), label: a.action.label, kind: 'update_goal_penalty', args: a.action.args, expiresAt: c.now + ACTION_TTL_MS };
    c.s.pendingActions[pendingAction.id] = { ...pendingAction, userId: me.id };
  }
  addThread(c, 'bot', a.text, pendingAction);
  return ok({ text: a.text, pendingAction });
}

export function confirmBotAction(c: Ctx, actionId: string): Result<BotReply> {
  const me = meOf(c);
  if (!me) return err('no_user');
  const act = c.s.pendingActions[actionId];
  if (!act || act.userId !== me.id) return err('action_not_found');
  if (c.now > act.expiresAt) {
    delete c.s.pendingActions[actionId];
    return err('action_expired');
  }
  const res = updateGoalPenalty(c, String(act.args.goalId), Number(act.args.baseCents));
  delete c.s.pendingActions[actionId]; // F9: second confirm → action_not_found
  const text = res.ok ? `Done. "${res.data.title}" now costs ${formatCents(res.data.basePenaltyCents)} per flake. Brave.` : 'I could not do that one.';
  addThread(c, 'bot', text);
  for (const m of c.s.botThreads[me.id] ?? []) if (m.pendingAction?.id === actionId) m.pendingAction = undefined;
  return res.ok ? ok({ text }) : res;
}

/* ---------- pool / cash-out ---------- */
export function setPoolGoal(c: Ctx, name: string, cents: number): Result<Squad> {
  const me = meOf(c);
  if (!me?.squadId) return err('not_in_squad');
  if (name.trim().length < 1 || name.trim().length > 30) return err('invalid_name');
  const bad = validatePoolGoal(cents);
  if (bad) return err(bad);
  const sq = c.s.squads[me.squadId];
  sq.poolGoalName = name.trim();
  sq.poolGoalCents = cents;
  pushFeed(c.s, sq.id, me.id, 'commit', `New pool goal: ${sq.poolGoalName} (${formatCents(cents)}).`, c.now);
  checkPoolMilestones(c, sq);
  return ok(sq);
}

const openProposal = (s: MockState, squadId: string) =>
  Object.values(s.cashouts).find((p) => p.squadId === squadId && p.status === 'open') ?? null;
export { openProposal };

export function proposeCashout(c: Ctx, merchant: string): Result<CashoutProposal> {
  const me = meOf(c);
  if (!me?.squadId) return err('not_in_squad');
  const sq = c.s.squads[me.squadId];
  if (sq.poolBalanceCents < sq.poolGoalCents) return err('pool_not_ready');
  if (openProposal(c.s, sq.id)) return err('proposal_open');
  const p: CashoutProposal = {
    id: uid(c.s, 'co'), squadId: sq.id, proposerUserId: me.id, merchantName: merchant.trim().slice(0, 30) || 'Pizza House',
    amountCents: sq.poolGoalCents, status: 'open', votes: { [me.id]: true }, createdAt: c.now,
  };
  c.s.cashouts[p.id] = p;
  pushFeed(c.s, sq.id, me.id, 'cashout', `${me.name} proposed spending ${formatCents(p.amountCents)} at ${p.merchantName}. Vote!`, c.now);
  return resolveVotes(c, p);
}

function resolveVotes(c: Ctx, p: CashoutProposal): Result<CashoutProposal> {
  const sq = c.s.squads[p.squadId];
  const n = squadMembers(c.s, sq.id).length;
  const memberIds = new Set(squadMembers(c.s, sq.id).map((m) => m.id));
  const votes = Object.entries(p.votes).filter(([id]) => memberIds.has(id));
  const yes = votes.filter(([, v]) => v).length;
  const no = votes.filter(([, v]) => !v).length;
  if (yes * 2 > n) {
    if (sq.poolBalanceCents < p.amountCents) return err('pool_changed'); // X6
    sq.poolBalanceCents -= p.amountCents;
    p.status = 'paid';
    pushFeed(c.s, sq.id, null, 'cashout', `Approved! ${formatCents(p.amountCents)} spent at ${p.merchantName} 🍕🎉`, c.now);
  } else if (no * 2 > n) {
    p.status = 'rejected';
    pushFeed(c.s, sq.id, null, 'cashout', `The squad said no to ${p.merchantName}. Democracy hurts.`, c.now);
  }
  return ok(p);
}

export function voteCashout(c: Ctx, proposalId: string, approve: boolean): Result<CashoutProposal> {
  const me = meOf(c);
  if (!me?.squadId) return err('not_in_squad');
  const p = c.s.cashouts[proposalId];
  if (!p || p.status !== 'open') return err('proposal_not_found');
  if (p.squadId !== me.squadId) return err('not_in_squad');
  p.votes[me.id] = approve; // X3: latest vote wins
  return resolveVotes(c, p);
}

export function cancelCashout(c: Ctx, proposalId: string): Result<CashoutProposal> {
  const me = meOf(c);
  if (!me) return err('no_user');
  const p = c.s.cashouts[proposalId];
  if (!p || p.status !== 'open' || p.proposerUserId !== me.id) return err('proposal_not_found');
  p.status = 'cancelled';
  return ok(p);
}

/* ---------- derived (used by hooks + tests) ---------- */
export function leaderboardFor(s: MockState, squadId: string, now: number) {
  const members = squadMembers(s, squadId);
  const ids = new Set(members.map((m) => m.id));
  return buildLeaderboard(
    members, Object.values(s.goals).filter((g) => ids.has(g.userId)), Object.values(s.checkins).filter((x) => ids.has(x.userId)),
    Object.values(s.penalties).filter((p) => p.squadId === squadId), now, tzOf(s, squadId),
  );
}
