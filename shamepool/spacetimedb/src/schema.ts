// ShamePool Spacetime schema. All state lives here.
// Conventions: ids are strings (`u_x1`, `g_x2`, seed ids like `seed_kevin`), money is i32 integer cents,
// times are f64 epoch milliseconds in the *demo clock* (real time + demo_flags.time_offset_ms),
// '' means "none" for optional strings. Only outbox.next_try_at / created_at use the native timestamp type.
import { schema, table, t } from 'spacetimedb/server';

/* ---------- global ---------- */
const demoFlags = table({ name: 'demo_flags', public: true }, {
  id: t.u8().primaryKey(), // single row, id 0
  demoMode: t.bool(),
  nextPhotoFails: t.bool(),
  timeOffsetMs: t.f64(),
  fakeOn: t.bool(),
  fakeLat: t.f64(),
  fakeLng: t.f64(),
  fakeAcc: t.f64(),
});
/** The one identity allowed to call bridge reducers and read the bridge views. */
const bridge = table({ name: 'bridge' }, { id: t.u8().primaryKey(), identity: t.identity() });
const counter = table({ name: 'counter' }, { name: t.string().primaryKey(), n: t.u32() });
const milestone = table({ name: 'milestone' }, { key: t.string().primaryKey() });
const deadlineTick = table({ name: 'deadline_tick' }, {
  scheduledId: t.u64().primaryKey().autoInc(),
  scheduledAt: t.scheduleAt(),
});

/* ---------- accounts (private) ---------- */
const account = table({ name: 'account' }, {
  key: t.string().primaryKey(), // lowercase username
  userId: t.string().index('btree'),
  username: t.string(),
  email: t.string().index('btree'), // lowercase
  firstName: t.string(),
  lastName: t.string(),
  passwordHash: t.string(),
  securityJson: t.string(), // [{qId, answerHash}]
});
const authAttempt = table({ name: 'auth_attempt' }, { key: t.string().primaryKey(), n: t.u32(), untilMs: t.f64() });
const resetToken = table({ name: 'reset_token' }, { key: t.string().primaryKey(), token: t.string(), expiresMs: t.f64() });
/** Which user a connection identity is signed in as. */
const session = table({ name: 'session' }, { identity: t.identity().primaryKey(), userId: t.string().index('btree') });

/* ---------- public game state ---------- */
const user = table({ name: 'user', public: true }, {
  id: t.string().primaryKey(),
  name: t.string(),
  avatar: t.string(),
  squadId: t.string().index('btree'), // '' = no squad
  balanceCents: t.i32(),
  isSeed: t.bool().index('btree'),
});
const squad = table({ name: 'squad', public: true }, {
  id: t.string().primaryKey(),
  name: t.string(),
  inviteCode: t.string().index('btree'),
  poolGoalName: t.string(),
  poolGoalCents: t.i32(),
  poolBalanceCents: t.i32(),
  timezone: t.string(),
  relayLinked: t.bool(),
});
/** Who started each squad: the only member allowed to remove others. A separate table so existing squads migrate cleanly. */
const squadOwner = table({ name: 'squad_owner', public: true }, { squadId: t.string().primaryKey(), userId: t.string() });
/** banKey(squadId, userId) of removed members: they cannot rejoin with the squad's public invite code. */
const squadBan = table({ name: 'squad_ban' }, { key: t.string().primaryKey() });
/** Charity rule per squad: chosen charity and when the pool first reached its goal (-1 = not full). */
const squadCharity = table({ name: 'squad_charity', public: true }, {
  squadId: t.string().primaryKey(), charityId: t.string(), poolFullAt: t.f64(),
});
/** Simulated donations to the (fictional) demo charities. */
const donation = table({ name: 'donation', public: true }, {
  id: t.string().primaryKey(), squadId: t.string().index('btree'), charityId: t.string(), amountCents: t.i32(), reason: t.string(), createdAt: t.f64(),
});
/** Marks a cash-out proposal as a donation vote (its money goes to the charity instead of a merchant). */
const cashoutDonate = table({ name: 'cashout_donate', public: true }, {
  cashoutId: t.string().primaryKey(), squadId: t.string().index('btree'), charityId: t.string(),
});
const goal = table({ name: 'goal', public: true }, {
  id: t.string().primaryKey(),
  userId: t.string().index('btree'),
  squadId: t.string().index('btree'),
  title: t.string(),
  emoji: t.string(),
  lat: t.f64(),
  lng: t.f64(),
  radiusM: t.f64(),
  days: t.array(t.u8()), // 0 = Sunday
  deadlineMinutes: t.i32(),
  minStayMinutes: t.i32(),
  basePenaltyCents: t.i32(),
  maxPenaltyCents: t.i32(),
  consecutiveFlakes: t.i32(),
  streak: t.i32(),
  active: t.bool(),
  createdAt: t.f64(),
  lastEvaluatedDate: t.string(),
});
const checkin = table({ name: 'checkin', public: true }, {
  id: t.string().primaryKey(),
  goalId: t.string().index('btree'),
  userId: t.string().index('btree'),
  squadId: t.string().index('btree'),
  localDate: t.string(),
  status: t.string(), // in_progress | completed | failed
  startedAt: t.f64(),
  lastDistanceM: t.f64(),
  lastPingAt: t.f64(),
  attempts: t.i32(),
  aiState: t.string(), // '' | 'yes' | 'no'
  aiReason: t.string(),
  aiRoast: t.string(),
});
const penalty = table({ name: 'penalty', public: true }, {
  id: t.string().primaryKey(),
  key: t.string().unique(), // goalId:localDate, makes the flake idempotent
  goalId: t.string().index('btree'),
  userId: t.string().index('btree'),
  squadId: t.string().index('btree'),
  localDate: t.string(),
  amountCents: t.i32(),
  intendedCents: t.i32(),
  shortfallCents: t.i32(),
  status: t.string(), // pending | charged | failed
  createdAt: t.f64(),
  nessieTransferId: t.string(),
});
const feedEvent = table({ name: 'feed_event', public: true }, {
  id: t.string().primaryKey(),
  seq: t.u32(),
  squadId: t.string().index('btree'),
  actorUserId: t.string(), // '' = Squad Bot
  kind: t.string(),
  text: t.string(),
  createdAt: t.f64(),
  metaJson: t.string(),
});
const cashout = table({ name: 'cashout', public: true }, {
  id: t.string().primaryKey(),
  squadId: t.string().index('btree'),
  proposerUserId: t.string(),
  merchantName: t.string(),
  amountCents: t.i32(),
  status: t.string(), // open | approved | rejected | paid | cancelled
  createdAt: t.f64(),
  nessiePurchaseId: t.string(),
});
const cashoutVote = table({ name: 'cashout_vote', public: true }, {
  id: t.string().primaryKey(), // proposalId:userId
  proposalId: t.string().index('btree'),
  squadId: t.string().index('btree'),
  userId: t.string(),
  approve: t.bool(),
});
const withdrawal = table({ name: 'withdrawal', public: true }, {
  id: t.string().primaryKey(),
  userId: t.string().index('btree'),
  squadId: t.string().index('btree'),
  amountCents: t.i32(),
  status: t.string(), // pending | completed | cancelled
  destination: t.string(),
  createdAt: t.f64(),
  availableAt: t.f64(),
  nessieWithdrawalId: t.string(),
});

/* ---------- per-user private data (exposed to the owner through views) ---------- */
const billingPlan = table({ name: 'billing_plan' }, { userId: t.string().primaryKey(), tier: t.string(), trialEndsAt: t.f64() }); // -1 = none
const address = table({ name: 'address' }, {
  id: t.string().primaryKey(), userId: t.string().index('btree'), label: t.string(), fullName: t.string(), line1: t.string(), line2: t.string(),
  city: t.string(), state: t.string(), zip: t.string(), createdAt: t.f64(),
});
const paymentMethod = table({ name: 'payment_method' }, {
  id: t.string().primaryKey(), userId: t.string().index('btree'), nickname: t.string(), nameOnCard: t.string(), brand: t.string(), last4: t.string(),
  expMonth: t.i32(), expYear: t.i32(), addressId: t.string(), createdAt: t.f64(),
});
const botMessage = table({ name: 'bot_message' }, {
  id: t.string().primaryKey(), userId: t.string().index('btree'), fromBot: t.bool(), text: t.string(), actionJson: t.string(), createdAt: t.f64(),
});
const pendingAction = table({ name: 'pending_action' }, {
  id: t.string().primaryKey(), userId: t.string().index('btree'), label: t.string(), argsJson: t.string(), expiresAt: t.f64(),
});
const msgRate = table({ name: 'msg_rate' }, { userId: t.string().primaryKey(), timesJson: t.string() });

/* ---------- outbox: the only way the module talks to Nessie ---------- */
const outbox = table({ name: 'outbox' }, {
  id: t.u64().primaryKey().autoInc(),
  ik: t.string().index('btree'), // idempotency key, unique among non-failed jobs
  kind: t.string(),
  payload: t.string(), // JSON
  status: t.string(), // pending | done | failed
  attempts: t.u32(),
  nextTryAt: t.timestamp(),
  createdAt: t.timestamp(),
  result: t.string(),
});
/** Nessie ids per user (`u:<userId>`) and squad pool (`s:<squadId>`), written by outbox_done. */
const nessieLink = table({ name: 'nessie_link' }, { key: t.string().primaryKey(), customerId: t.string(), accountId: t.string() });

const spacetimedb = schema({
  demoFlags, bridge, counter, milestone, deadlineTick,
  account, authAttempt, resetToken, session,
  user, squad, squadOwner, squadBan, squadCharity, donation, cashoutDonate, goal, checkin, penalty, feedEvent, cashout, cashoutVote, withdrawal,
  billingPlan, address, paymentMethod, botMessage, pendingAction, msgRate,
  outbox, nessieLink,
});
export default spacetimedb;

export { deadlineTick, outbox, nessieLink, user, billingPlan, address, paymentMethod, botMessage };
