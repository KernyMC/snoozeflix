'use client';
// One Spacetime connection per browser tab, mirrored into a zustand store the hooks read from.
// Identity: anonymous Spacetime identity whose token lives in localStorage, so a phone that closes the tab (or a guest
// who joined from a QR code) is still the same user when it comes back. The module maps identity -> user in `session`.
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
  users: UserRow[]; squads: SquadRow[]; owners: { squadId: string; userId: string }[]; goals: GoalRow[];
  charity: { squadId: string; charityId: string; poolFullAt: number }[];
  donations: { id: string; squadId: string; charityId: string; amountCents: number; reason: string; createdAt: number }[];
  donateVotes: { cashoutId: string; squadId: string; charityId: string }[]; checkins: CheckinRow[]; penalties: PenaltyRow[]; feed: FeedRow[];
  cashouts: CashoutRow[]; votes: VoteRow[]; withdrawals: WithdrawalRow[];
  flags: FlagsRow | null;
  /** Demo "pretend I'm there" location. Per tab: the module's flags are global, so it is never sent to Spacetime. */
  fakeLocation: { lat: number; lng: number; accuracyM?: number } | null;
  /** Squad whose scoped subscription is applied ('' = none needed). Until it matches me.squadId the squad rows are incomplete. */
  squadSynced: string;
  me: UserRow | null; account: AccountView | null; plan: PlanRow | null; addresses: AddressRow[]; payments: PaymentRow[]; bot: BotRow[];
}

const FAKE_KEY = 'shamepool-fake-location';
/** The demo fake location survives reloads of this tab (sessionStorage), never other tabs or devices. */
function loadFakeLocation(): LiveState['fakeLocation'] {
  try {
    if (typeof window === 'undefined') return null;
    const v = JSON.parse(window.sessionStorage.getItem(FAKE_KEY) ?? 'null') as LiveState['fakeLocation'];
    return v && Number.isFinite(v.lat) && Number.isFinite(v.lng) ? v : null;
  } catch { return null; }
}
export function setFakeLocation(v: LiveState['fakeLocation']): void {
  useLive.setState({ fakeLocation: v });
  try { if (v) window.sessionStorage.setItem(FAKE_KEY, JSON.stringify(v)); else window.sessionStorage.removeItem(FAKE_KEY); } catch { /* blocked */ }
}

export const useLive = create<LiveState>(() => ({
  status: 'connecting', users: [], squads: [], owners: [], charity: [], donations: [], donateVotes: [], goals: [], checkins: [], penalties: [], feed: [], cashouts: [], votes: [], withdrawals: [],
  flags: null, fakeLocation: loadFakeLocation(), squadSynced: '', me: null, account: null, plan: null, addresses: [], payments: [], bot: [],
}));

/** Demo clock offset (ms) for code outside React. */
export const offsetMs = (): number => useLive.getState().flags?.timeOffsetMs ?? 0;
export const nowMs = (): number => Date.now() + offsetMs();

/* ---------- token ---------- */
/** Reads the saved token: localStorage first, then the per-tab copy older builds kept in sessionStorage. */
export function loadToken(store: { local?: Storage | null; session?: Storage | null } = browserStores()): string | undefined {
  for (const s of [store.local, store.session]) {
    try { const t = s?.getItem(TOKEN_KEY); if (t) return t; } catch { /* blocked */ }
  }
  return undefined;
}
export function saveToken(token: string, store: { local?: Storage | null; session?: Storage | null } = browserStores()): void {
  for (const s of [store.local, store.session]) {
    try { s?.setItem(TOKEN_KEY, token); } catch { /* blocked: identity lasts until reload */ }
  }
}
function browserStores(): { local: Storage | null; session: Storage | null } {
  const get = (k: 'localStorage' | 'sessionStorage') => { try { return typeof window === 'undefined' ? null : window[k]; } catch { return null; } };
  return { local: get('localStorage'), session: get('sessionStorage') };
}

/* ---------- table mirroring ---------- */
type Key = keyof LiveState;
// [store key, accessor on conn.db, single row?]
const MIRROR: [Key, string, boolean?][] = [
  ['users', 'user'], ['squads', 'squad'], ['owners', 'squadOwner'], ['charity', 'squadCharity'], ['donations', 'donation'], ['donateVotes', 'cashoutDonate'],
  ['goals', 'goal'], ['checkins', 'checkin'], ['penalties', 'penalty'], ['feed', 'feedEvent'],
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
      .onApplied(() => {
        try { old?.unsubscribe(); } catch { /* already gone */ }
        markDirty(...MIRROR.map(([k]) => k));
        if (flushTimer) clearTimeout(flushTimer);
        flush();
        if (squadSubFor === squadId) useLive.setState({ squadSynced: squadId });
      })
      .onError((ctx) => {
        console.warn('[live] squad subscription failed', ctx.event);
        if (squadSubFor === squadId) useLive.setState({ squadSynced: squadId }); // do not leave the app loading forever
      })
      .subscribe([
        tables.squad.where((r) => r.id.eq(squadId)),
        tables.squadOwner.where((r) => r.squadId.eq(squadId)),
        tables.squadCharity.where((r) => r.squadId.eq(squadId)),
        tables.donation.where((r) => r.squadId.eq(squadId)),
        tables.cashoutDonate.where((r) => r.squadId.eq(squadId)),
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
    useLive.setState({ squadSynced: '' });
  }
}

function connect(): void {
  if (conn || typeof window === 'undefined') return;
  useLive.setState({ status: 'connecting', squadSynced: '' });
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
    const check = () => {
      if (conn && useLive.getState().status === 'ready') { clearTimeout(t); resolve(conn); return; }
      waiters.push(check);
    };
    const t = setTimeout(() => {
      const i = waiters.indexOf(check);
      if (i >= 0) waiters.splice(i, 1); // L17: do not leak the closure
      reject(new Error('offline'));
    }, timeoutMs);
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
