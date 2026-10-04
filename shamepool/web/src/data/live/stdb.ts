'use client';
// One Spacetime connection per browser tab, mirrored into a zustand store the hooks read from.
// Identity: anonymous Spacetime identity whose token lives in sessionStorage (one identity per tab, like the mock's
// per-tab session), so several tabs can be signed in as different users. The module maps identity -> user in `session`.
import { create } from 'zustand';
import { DbConnection, tables, type SubscriptionHandle } from './bindings';
import type {
  AccountView, BotRow, CashoutRow, CheckinRow, FeedRow, GoalRow, PaymentRow, PenaltyRow, PlanRow, SquadRow, UserRow, VoteRow, WithdrawalRow, AddressRow,
} from './mappers';

const URI = process.env.NEXT_PUBLIC_STDB_URI || 'wss://maincloud.spacetimedb.com';
const DB = process.env.NEXT_PUBLIC_STDB_DB || 'shamepool-mvp';
const TOKEN_KEY = 'shamepool-stdb-token';

export interface FlagsRow {
  id: number; demoMode: boolean; nextPhotoFails: boolean; timeOffsetMs: number; fakeOn: boolean; fakeLat: number; fakeLng: number; fakeAcc: number;
}

export interface LiveState {
  status: 'connecting' | 'ready' | 'error';
  users: UserRow[]; squads: SquadRow[]; goals: GoalRow[]; checkins: CheckinRow[]; penalties: PenaltyRow[]; feed: FeedRow[];
  cashouts: CashoutRow[]; votes: VoteRow[]; withdrawals: WithdrawalRow[];
  flags: FlagsRow | null;
  me: UserRow | null; account: AccountView | null; plan: PlanRow | null; addresses: AddressRow[]; payments: PaymentRow[]; bot: BotRow[];
}

export const useLive = create<LiveState>(() => ({
  status: 'connecting', users: [], squads: [], goals: [], checkins: [], penalties: [], feed: [], cashouts: [], votes: [], withdrawals: [],
  flags: null, me: null, account: null, plan: null, addresses: [], payments: [], bot: [],
}));

/** Demo clock offset (ms) for code outside React. */
export const offsetMs = (): number => useLive.getState().flags?.timeOffsetMs ?? 0;
export const nowMs = (): number => Date.now() + offsetMs();

/* ---------- token ---------- */
function loadToken(): string | undefined {
  try { return sessionStorage.getItem(TOKEN_KEY) ?? undefined; } catch { return undefined; }
}
function saveToken(token: string): void {
  try { sessionStorage.setItem(TOKEN_KEY, token); } catch { /* blocked: identity lasts until reload */ }
}

/* ---------- table mirroring ---------- */
type Key = keyof LiveState;
// [store key, accessor on conn.db, single row?]
const MIRROR: [Key, string, boolean?][] = [
  ['users', 'user'], ['squads', 'squad'], ['goals', 'goal'], ['checkins', 'checkin'], ['penalties', 'penalty'], ['feed', 'feedEvent'],
  ['cashouts', 'cashout'], ['votes', 'cashoutVote'], ['withdrawals', 'withdrawal'], ['flags', 'demoFlags', true],
  ['me', 'myUser', true], ['account', 'myAccount', true], ['plan', 'myBillingPlan', true], ['addresses', 'myAddresses'], ['payments', 'myPaymentMethods'],
  ['bot', 'myBotMessages'],
];

let conn: DbConnection | null = null;
let starts = 0;
let stopTimer: ReturnType<typeof setTimeout> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retries = 0;
let generation = 0;
let squadSub: SubscriptionHandle | null = null;
let squadSubFor = '';
const dirty = new Set<Key>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const waiters: (() => void)[] = [];

function flush(): void {
  flushTimer = null;
  const c = conn;
  if (!c) return;
  const patch: Record<string, unknown> = {};
  for (const [key, acc, single] of MIRROR) {
    if (!dirty.has(key)) continue;
    const table = (c.db as unknown as Record<string, { iter(): Iterable<unknown> }>)[acc];
    const rows = [...table.iter()];
    patch[key] = single ? rows[0] ?? null : rows;
  }
  dirty.clear();
  if (Object.keys(patch).length) useLive.setState(patch as Partial<LiveState>);
  syncSquadSubscription();
}
function markDirty(...keys: Key[]): void {
  for (const k of keys) dirty.add(k);
  if (!flushTimer) flushTimer = setTimeout(flush, 0);
}

/** Squad-scoped rows are subscribed with WHERE squad_id = X and resubscribed when the user changes squad. */
function syncSquadSubscription(): void {
  const c = conn;
  if (!c) return;
  const squadId = useLive.getState().me?.squadId ?? '';
  if (squadId === squadSubFor) return;
  squadSubFor = squadId;
  const old = squadSub;
  squadSub = null;
  if (squadId) {
    const next = c.subscriptionBuilder()
      .onApplied(() => { try { old?.unsubscribe(); } catch { /* already gone */ } markDirty(...MIRROR.map(([k]) => k)); })
      .onError((ctx) => console.warn('[live] squad subscription failed', ctx.event))
      .subscribe([
        tables.squad.where((r) => r.id.eq(squadId)),
        tables.user.where((r) => r.squadId.eq(squadId)),
        tables.goal.where((r) => r.squadId.eq(squadId)),
        tables.checkin.where((r) => r.squadId.eq(squadId)),
        tables.penalty.where((r) => r.squadId.eq(squadId)),
        tables.feedEvent.where((r) => r.squadId.eq(squadId)),
        tables.cashout.where((r) => r.squadId.eq(squadId)),
        tables.cashoutVote.where((r) => r.squadId.eq(squadId)),
        tables.withdrawal.where((r) => r.squadId.eq(squadId)),
      ]);
    squadSub = next;
  } else {
    try { old?.unsubscribe(); } catch { /* already gone */ }
    markDirty(...MIRROR.map(([k]) => k));
  }
}

function connect(): void {
  if (conn || typeof window === 'undefined') return;
  useLive.setState({ status: 'connecting' });
  const gen = ++generation;
  squadSubFor = '';
  squadSub = null;
  const built = DbConnection.builder()
    .withUri(URI)
    .withDatabaseName(DB)
    .withToken(loadToken())
    .onConnect((c, _identity, token) => {
      if (gen !== generation) { try { c.disconnect(); } catch { /* ignore */ } return; }
      saveToken(token);
      retries = 0;
      for (const [key, acc] of MIRROR) {
        const table = (c.db as unknown as Record<string, {
          onInsert(cb: () => void): void; onUpdate?(cb: () => void): void; onDelete(cb: () => void): void;
        }>)[acc];
        const cb = () => markDirty(key);
        table.onInsert(cb);
        table.onDelete(cb);
        table.onUpdate?.(cb);
      }
      c.subscriptionBuilder()
        .onApplied(() => {
          markDirty(...MIRROR.map(([k]) => k));
          if (flushTimer) clearTimeout(flushTimer);
          flush();
          useLive.setState({ status: 'ready' });
          while (waiters.length) waiters.shift()?.();
        })
        .onError((ctx) => { console.warn('[live] subscription failed', ctx.event); useLive.setState({ status: 'error' }); })
        .subscribe([
          tables.demoFlags, tables.myUser, tables.myAccount, tables.myBillingPlan, tables.myAddresses, tables.myPaymentMethods, tables.myBotMessages,
          tables.user.where((r) => r.isSeed.eq(true)),
        ]);
    })
    .onConnectError((_c, e) => { if (gen !== generation) return; console.warn('[live] connect error', e); lost(); })
    .onDisconnect(() => { if (gen === generation) lost(); })
    .build();
  conn = built;
}

function lost(): void {
  const wasStopping = starts === 0;
  try { conn?.disconnect(); } catch { /* ignore */ }
  conn = null;
  if (wasStopping) return;
  useLive.setState({ status: retries > 3 ? 'error' : 'connecting' });
  const delay = Math.min(1000 * 2 ** retries, 15_000);
  retries++;
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = setTimeout(() => { retryTimer = null; if (starts > 0) connect(); }, delay);
}

/** Open the connection once per tab (safe to call from React effects, including Strict Mode double invokes). Returns a stop function. */
export function startLive(): () => void {
  starts++;
  if (stopTimer) { clearTimeout(stopTimer); stopTimer = null; }
  connect();
  return () => {
    starts = Math.max(0, starts - 1);
    if (starts > 0) return;
    stopTimer = setTimeout(() => {
      stopTimer = null;
      if (starts > 0) return;
      if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
      generation++;
      try { conn?.disconnect(); } catch { /* ignore */ }
      conn = null;
    }, 400);
  };
}

/** Resolves with the connection once the base subscription is applied (or rejects after `timeoutMs`). */
export function whenReady(timeoutMs = 8000): Promise<DbConnection> {
  if (conn && useLive.getState().status === 'ready') return Promise.resolve(conn);
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('offline')), timeoutMs);
    const check = () => {
      if (conn && useLive.getState().status === 'ready') { clearTimeout(t); resolve(conn); return; }
      waiters.push(check);
    };
    check();
  });
}

/** Wait until `pred` holds on the mirrored state (e.g. the row a procedure just created arrived). Gives up quietly after `ms`. */
export function settle(pred: (s: LiveState) => boolean, ms = 3000): Promise<void> {
  if (pred(useLive.getState())) return Promise.resolve();
  return new Promise((resolve) => {
    const t = setTimeout(() => { unsub(); resolve(); }, ms);
    const unsub = useLive.subscribe((s) => { if (pred(s)) { clearTimeout(t); unsub(); resolve(); } });
  });
}

export const getConn = (): DbConnection | null => conn;
