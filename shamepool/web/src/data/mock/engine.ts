import {
  applyPenalty, availableToWithdraw, buildLeaderboard, MIN_WITHDRAW_CENTS, stakeBreakdown,
  validateWithdrawal, WITHDRAW_COOLDOWN_DEMO_MS, WITHDRAW_COOLDOWN_REAL_MS, dateAddDays, deadlinePassed, formatCents, formatDistance, generateInviteCode, haversineM,
  isDueToday, isInside, LIMITS, localDate, localMinutes, missedDates, nextPenaltyCents, normalizeInviteCode, penaltyKey,
  validateGoalInput, validateName, validatePoolGoal, banKey, kickError, ownerFromFeed, goalLimit, goalsOverLimit,
} from '../logic';
import { isValidSnapshot } from '../inviteSnapshot';
import type {
  BotReply, InviteSnapshot, CashoutProposal, Checkin, FeedEvent, Goal, GoalInput, PhotoVerdict, Penalty, Pos, Result, Squad, User, Wallet, Withdrawal, Donation, CharityStatus, AiBotInput,
} from '../types';
import { answer, brokeLine, hypeLine, photoRoast, roastLine, type BotAnswer } from './bot';
import { CASHOUT_WINDOW_DEMO_MS, CASHOUT_WINDOW_REAL_MS, DEFAULT_CHARITY_ID, charityById, isCharityId } from '../charities';
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
  const u: User = { id: uid(c.s, 'u'), name: input.name.trim(), avatar: input.avatar || '/assets/avatar/01-coin-thief.png', squadId: null, balanceCents: 20000 };
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
    poolGoalCents: input.poolGoalCents, poolBalanceCents: 0, timezone: 'America/Detroit', relayLinked: false, charityId: DEFAULT_CHARITY_ID, poolFullAt: null,
    ownerUserId: me.id,
  };
  c.s.squads[squad.id] = squad;
  me.squadId = squad.id;
  pushFeed(c.s, squad.id, me.id, 'commit', `${me.name} started the squad "${squad.name}". Goal: ${squad.poolGoalName}.`, c.now);
  return ok(squad);
}

export function joinSquad(c: Ctx, rawCode: string, invite?: InviteSnapshot | null): Result<Squad> {
  const me = meOf(c);
  if (!me) return err('no_user');
  if (me.squadId) return err('already_in_squad');
  const code = normalizeInviteCode(rawCode);
  let squad = Object.values(c.s.squads).find((q) => q.inviteCode === code);
  // Scanned on a device that has never seen this squad: rebuild it from the link, unless that would clash with something we already hold.
  if (!squad && invite && isValidSnapshot(invite) && normalizeInviteCode(invite.code) === code && !c.s.squads[invite.id]) {
    squad = {
      id: invite.id, name: invite.name.trim(), inviteCode: code, poolGoalName: invite.poolGoalName.trim(), poolGoalCents: invite.poolGoalCents,
      poolBalanceCents: 0, timezone: 'America/Detroit', relayLinked: false, charityId: DEFAULT_CHARITY_ID, poolFullAt: null,
    };
    c.s.squads[squad.id] = squad;
    if (invite.ownerName) {
      const ownerId = `u_inv_${invite.id}`;
      squad.ownerUserId = ownerId;
      c.s.users[ownerId] = { id: ownerId, name: invite.ownerName.trim(), avatar: invite.ownerAvatar || '/assets/avatar/01-coin-thief.png', squadId: squad.id, balanceCents: 20000 };
      pushFeed(c.s, squad.id, ownerId, 'commit', `${invite.ownerName.trim()} started the squad "${squad.name}". Goal: ${squad.poolGoalName}.`, c.now);
    }
  }
  if (!squad) return err('invalid_code');
  if (c.s.bans?.[banKey(squad.id, me.id)]) return err('kicked_from_squad');
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
  const tier = c.s.billing?.[me.id]?.tier ?? 'free';
  if (active >= Math.min(LIMITS.maxGoalsPerUser, goalLimit(tier))) return err(tier === 'paid' ? 'too_many_goals' : 'upgrade_required');
  const tz = tzOf(c.s, me.squadId);
  const goal: Goal = {
    ...input, deadlineMinutes: input.deadlineMinutes === 0 ? 1439 : input.deadlineMinutes, // 00:00 means end of day, never an impossible deadline
    title: input.title.trim(), emoji: input.emoji || 'goal-target', daysOfWeek: [...new Set(input.daysOfWeek)].sort(),
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

/** `ai`: a vision verdict from the server; `null` = the AI check was unavailable (accept, flagged); `undefined` = not attempted (mock default). */
export function finishCheckin(c: Ctx, checkinId: string, photo: string, ai?: PhotoVerdict | null): Result<{ checkin: Checkin; verdict: PhotoVerdict }> {
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

  if (ai === null) { // AI check unavailable: accept once (flagged), then ask for a retry
    ck.aiUnavailableCount = (ck.aiUnavailableCount ?? 0) + 1;
    if (ck.aiUnavailableCount > 1) return err('ai_unavailable');
  }
  ck.attempts += 1;
  const forced = c.s.demo.nextPhotoFails;
  if (forced) c.s.demo.nextPhotoFails = false;
  const aiOk = ai ? { ...ai, confidence: Math.max(0, Math.min(1, Number(ai.confidence) || 0.7)), reason: String(ai.reason ?? '').slice(0, 120), roast: ai.roast ? String(ai.roast).slice(0, 140) : null } : ai;
  const rejection: PhotoVerdict | null = forced
    ? { verified: false, confidence: 0.92, reason: 'Not the right place', roast: photoRoast(hash(ck.id) + ck.attempts) }
    : aiOk && !aiOk.verified
      ? { ...aiOk, verified: false, reason: aiOk.reason || 'Not the right place', roast: aiOk.roast ?? photoRoast(hash(ck.id) + ck.attempts) }
      : null;
  if (rejection) {
    const verdict = rejection;
    ck.aiVerified = false; ck.aiReason = verdict.reason; ck.aiRoast = verdict.roast;
    if (ck.attempts >= LIMITS.maxPhotoAttempts) {
      ck.status = 'failed';
      return err('too_many_attempts', { verdict });
    }
    return err('photo_rejected', { verdict, attemptsLeft: LIMITS.maxPhotoAttempts - ck.attempts });
  }
  const verdict: PhotoVerdict = aiOk && aiOk.verified
    ? { verified: true, confidence: aiOk.confidence, reason: aiOk.reason || 'Looks right', roast: null }
    : { verified: true, confidence: ai === null ? 0.5 : 0.94, reason: ai === null ? 'AI check unavailable' : `Looks like a real ${goal.title.toLowerCase()} moment`, roast: null };
  ck.status = 'completed'; ck.aiVerified = ai !== null; ck.aiReason = verdict.reason; ck.aiRoast = null;
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
  syncPoolFull(c, squad);
  return pen;
}

export function forceFlake(c: Ctx, goalId: string): Result<Penalty> {
  const me = meOf(c);
  if (!me) return err('no_user');
  const goal = c.s.goals[goalId];
  if (!goal) return err('goal_not_found');
  if (goal.squadId !== me.squadId) return err('not_in_squad');
  if (goal.userId !== me.id) return err('not_your_goal'); // demo tool: you can only flake your own goals
  if (!goal.active) return err('goal_not_found');
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

/** Turns an AI answer into text plus a validated action (the model is never trusted with money or ownership). */
function fromAi(c: Ctx, userId: string, ai: AiBotInput): BotAnswer {
  const text = String(ai.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 400) || 'Hmm, I got nothing. Try again?';
  if (!ai.action) return { text };
  const goals = Object.values(c.s.goals).filter((g) => g.userId === userId && g.active);
  const want = String(ai.action.goalTitle ?? '').trim().toLowerCase();
  const goal = goals.find((g) => g.title.toLowerCase() === want)
    ?? goals.find((g) => want && (g.title.toLowerCase().includes(want) || want.includes(g.title.toLowerCase())));
  if (!goal) return { text: `${text} (I could not find that goal, so nothing will change.)` };
  const cents = Math.round(Number(ai.action.dollars) * 100);
  if (!Number.isInteger(cents) || cents < LIMITS.penaltyMin || cents > goal.maxPenaltyCents) {
    return { text: `The penalty on ${goal.title} has to be between $1 and ${formatCents(goal.maxPenaltyCents)}.` };
  }
  return { text, action: { label: `${goal.title}: ${formatCents(goal.basePenaltyCents)} \u2192 ${formatCents(cents)}`, args: { goalId: goal.id, baseCents: cents } } };
}

export function askBot(c: Ctx, text: string, ai?: AiBotInput): Result<BotReply> {
  const me = meOf(c);
  if (!me) return err('no_user');
  const t = text.trim();
  if (t.length < 1 || t.length > LIMITS.messageMax) return err('invalid_message');
  addThread(c, 'me', t);
  const a = ai ? fromAi(c, me.id, ai) : answer(c.s, me.id, t, c.now);
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
  if (sq.poolFullAt && sq.poolBalanceCents >= sq.poolGoalCents) return err('goal_locked'); // no stalling the charity clock
  sq.poolGoalName = name.trim();
  sq.poolGoalCents = cents;
  syncPoolFull(c, sq);
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
    amountCents: sq.poolGoalCents, status: 'open', votes: { [me.id]: true }, createdAt: c.now, kind: 'spend',
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
    p.status = 'paid';
    if (p.kind === 'donate') {
      donate(c, sq, 'vote', p.amountCents, p.charityId);
    } else {
      sq.poolBalanceCents -= p.amountCents;
      pushFeed(c.s, sq.id, null, 'cashout', `Approved! ${formatCents(p.amountCents)} spent at ${p.merchantName} 🍕🎉`, c.now);
      syncPoolFull(c, sq);
    }
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

/** Pauses the goals a user has beyond their plan's limit (newest first). Returns how many were paused. */
export function enforceGoalLimit(c: Ctx, userId: string): number {
  const extra = goalsOverLimit(Object.values(c.s.goals).filter((g) => g.userId === userId), goalLimit(c.s.billing?.[userId]?.tier));
  for (const g of extra) g.active = false;
  return extra.length;
}

/** The squad's owner: stored on the squad, or read from its "started the squad" event for older squads. */
export function ownerOf(s: MockState, squadId: string): string | null {
  return s.squads[squadId]?.ownerUserId ?? ownerFromFeed(s.feed.filter((f) => f.squadId === squadId));
}

/**
 * The owner removes a member. Their money is theirs (balance and pending withdrawals stay), what they already paid into
 * the pool stays with the squad, their goals stop (no more charges into a squad they left), an open check-in fails, a
 * cash-out they proposed is cancelled and any open vote is re-counted with the smaller squad. They cannot rejoin with
 * the same code.
 */
export function kickMember(c: Ctx, userId: string): Result<true> {
  const me = meOf(c);
  const target = c.s.users[userId];
  const bad = kickError(me, me?.squadId ? ownerOf(c.s, me.squadId) : null, target);
  if (bad || !me || !target) return err(bad ?? 'member_not_found');
  const squadId = me.squadId as string;
  target.squadId = null;
  for (const g of Object.values(c.s.goals)) if (g.userId === target.id && g.squadId === squadId && g.active) g.active = false;
  for (const ck of Object.values(c.s.checkins)) if (ck.userId === target.id && ck.status === 'in_progress') ck.status = 'failed';
  for (const p of Object.values(c.s.cashouts)) {
    if (p.squadId === squadId && p.status === 'open' && p.proposerUserId === target.id) p.status = 'cancelled';
  }
  (c.s.bans ??= {})[banKey(squadId, target.id)] = true;
  pushFeed(c.s, squadId, me.id, 'commit', `${me.name} removed ${target.name} from the squad. What they paid stays in the pool.`, c.now);
  const open = openProposal(c.s, squadId);
  if (open) resolveVotes(c, open); // fewer members: the vote may be decided now
  return ok(true);
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

/* ---------- wallet / withdrawals ---------- */
export const cooldownMs = (): number =>
  process.env.NEXT_PUBLIC_DEMO === 'true' ? WITHDRAW_COOLDOWN_DEMO_MS : WITHDRAW_COOLDOWN_REAL_MS;
export const WITHDRAW_DESTINATION = 'Capital One \u2022\u2022\u2022\u20224821';

export function walletFor(s: MockState, userId: string, now: number): Wallet {
  const user = s.users[userId];
  const tz = tzOf(s, user?.squadId ?? null);
  const today = localDate(now, tz);
  const goals = Object.values(s.goals).filter((g) => g.userId === userId && g.active);
  const handled = (goalId: string) =>
    checkinFor(s, goalId, today)?.status === 'completed' || !!s.penalties[penaltyKey(goalId, today)];
  const stake = stakeBreakdown(goals, now, tz, handled);
  const stakeCents = stake.reduce((a, x) => a + x.cents, 0);
  const pendingCents = Object.values(s.withdrawals).filter((w) => w.userId === userId && w.status === 'pending').reduce((a, w) => a + w.amountCents, 0);
  const balanceCents = user?.balanceCents ?? 0;
  return {
    balanceCents, stakeCents, availableCents: availableToWithdraw(balanceCents, stakeCents), pendingCents, stake,
    minWithdrawCents: MIN_WITHDRAW_CENTS, cooldownMs: cooldownMs(),
  };
}

export function requestWithdrawal(c: Ctx, amountCents: number): Result<Withdrawal> {
  const me = meOf(c);
  if (!me) return err('no_user');
  if (!me.squadId) return err('not_in_squad');
  if (!Number.isInteger(amountCents) || amountCents <= 0) return err('invalid_amount');
  if (Object.values(c.s.withdrawals).some((w) => w.userId === me.id && w.status === 'pending')) return err('withdrawal_pending');
  const wallet = walletFor(c.s, me.id, c.now);
  const bad = validateWithdrawal(amountCents, wallet.availableCents);
  if (bad) return err(bad, { availableCents: wallet.availableCents, stakeCents: wallet.stakeCents, minCents: MIN_WITHDRAW_CENTS });
  me.balanceCents -= amountCents; // escrow
  const w: Withdrawal = {
    id: uid(c.s, 'w'), userId: me.id, squadId: me.squadId, amountCents, status: 'pending',
    destination: WITHDRAW_DESTINATION, createdAt: c.now, availableAt: c.now + cooldownMs(),
  };
  c.s.withdrawals[w.id] = w;
  pushFeed(c.s, me.squadId, me.id, 'withdrawal', `${me.name} is withdrawing ${formatCents(amountCents)}. Cooling off...`, c.now, { withdrawalId: w.id });
  return ok(w);
}

export function cancelWithdrawal(c: Ctx, id: string): Result<Withdrawal> {
  const me = meOf(c);
  if (!me) return err('no_user');
  const w = c.s.withdrawals[id];
  if (!w || w.userId !== me.id || w.status !== 'pending') return err('withdrawal_not_found');
  w.status = 'cancelled';
  me.balanceCents += w.amountCents;
  pushFeed(c.s, w.squadId, me.id, 'withdrawal', `${me.name} changed their mind and cancelled the withdrawal. Back in the game.`, c.now);
  return ok(w);
}

/** Scheduler: complete withdrawals whose cooling period ended. Returns how many. */
export function settleWithdrawals(c: Ctx): number {
  let n = 0;
  for (const w of Object.values(c.s.withdrawals)) {
    if (w.status !== 'pending' || c.now < w.availableAt) continue;
    w.status = 'completed';
    n++;
    const u = c.s.users[w.userId];
    pushFeed(c.s, w.squadId, u?.id ?? null, 'withdrawal', `${u?.name ?? 'Someone'} withdrew ${formatCents(w.amountCents)} to ${w.destination}.`, c.now);
  }
  return n;
}

/* ---------- charity: a full pool nobody spends goes to the squad's charity ---------- */
export const charityWindowMs = (): number =>
  process.env.NEXT_PUBLIC_DEMO === 'true' ? CASHOUT_WINDOW_DEMO_MS : CASHOUT_WINDOW_REAL_MS;

/** Starts the cash-out clock the first time the pool reaches its goal; stops it when the pool drops below. */
function syncPoolFull(c: Ctx, squad: Squad): void {
  const full = squad.poolGoalCents > 0 && squad.poolBalanceCents >= squad.poolGoalCents;
  if (full && !squad.poolFullAt) squad.poolFullAt = c.now;
  if (!full) squad.poolFullAt = null;
}

function donate(c: Ctx, squad: Squad, reason: Donation['reason'], amountCents: number, charityId?: string): Donation {
  const ch = charityById(charityId ?? squad.charityId);
  squad.poolBalanceCents -= amountCents;
  const d: Donation = { id: uid(c.s, 'd'), squadId: squad.id, charityId: ch.id, amountCents, reason, createdAt: c.now };
  c.s.donations[d.id] = d;
  pushFeed(c.s, squad.id, null, 'cashout',
    reason === 'vote'
      ? `The squad donated ${formatCents(amountCents)} to ${ch.name}. Flaking did some good.`
      : `Nobody spent the pool in time, so ${formatCents(amountCents)} went to ${ch.name}. Flaking did some good.`, c.now);
  squad.poolFullAt = null;
  syncPoolFull(c, squad); // overflow can start the next clock right away
  return d;
}

export function charityStatusFor(squad: Squad): CharityStatus {
  return { charityId: squad.charityId, windowMs: charityWindowMs(), deadlineAt: squad.poolFullAt ? squad.poolFullAt + charityWindowMs() : null };
}

export function setCharity(c: Ctx, charityId: string): Result<Squad> {
  const me = meOf(c);
  if (!me?.squadId) return err('not_in_squad');
  if (!isCharityId(charityId)) return err('invalid_charity');
  const sq = c.s.squads[me.squadId];
  const open = openProposal(c.s, sq.id);
  if (open?.kind === 'donate') return err('charity_locked'); // do not change it under a vote
  if (sq.charityId === charityId) return ok(sq);
  sq.charityId = charityId;
  pushFeed(c.s, sq.id, me.id, 'commit', `${me.name} set the squad charity to ${charityById(charityId).name}.`, c.now);
  return ok(sq);
}

export function proposeDonation(c: Ctx): Result<CashoutProposal> {
  const me = meOf(c);
  if (!me?.squadId) return err('not_in_squad');
  const sq = c.s.squads[me.squadId];
  if (sq.poolBalanceCents < sq.poolGoalCents) return err('pool_not_ready');
  if (openProposal(c.s, sq.id)) return err('proposal_open');
  const ch = charityById(sq.charityId);
  const p: CashoutProposal = {
    id: uid(c.s, 'co'), squadId: sq.id, proposerUserId: me.id, merchantName: ch.name, amountCents: sq.poolGoalCents,
    status: 'open', votes: { [me.id]: true }, createdAt: c.now, kind: 'donate', charityId: ch.id,
  };
  c.s.cashouts[p.id] = p;
  pushFeed(c.s, sq.id, me.id, 'cashout', `${me.name} proposed donating ${formatCents(p.amountCents)} to ${ch.name}. Vote!`, c.now);
  return resolveVotes(c, p);
}

/** Scheduler: donate every pool whose cash-out window ran out with no vote in progress. Returns how many. */
export function settleCharity(c: Ctx): number {
  let n = 0;
  for (const sq of Object.values(c.s.squads)) {
    syncPoolFull(c, sq);
    if (!sq.poolFullAt || c.now < sq.poolFullAt + charityWindowMs()) continue;
    if (openProposal(c.s, sq.id)) continue; // the clock waits while the squad is voting
    if (sq.poolBalanceCents < sq.poolGoalCents) continue;
    donate(c, sq, 'auto_deadline', sq.poolGoalCents);
    n++;
  }
  return n;
}

/** Demo helper: pretend the window already ran out and donate right away. */
export function demoExpirePoolDeadline(c: Ctx): Result<Squad> {
  const me = meOf(c);
  if (!me?.squadId) return err('not_in_squad');
  const sq = c.s.squads[me.squadId];
  if (sq.poolBalanceCents < sq.poolGoalCents) return err('pool_not_ready');
  sq.poolFullAt = c.now - charityWindowMs() - 1;
  settleCharity(c);
  return ok(sq);
}
