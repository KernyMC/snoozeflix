import { create } from 'zustand';
import { evaluateDeadlines } from './engine';
import { makeSeed } from './seed';
import { type Ctx, type MockState, MOCK_VERSION, STORAGE_KEY } from './state';

const CHANNEL = 'shamepool';
const LEADER_KEY = 'shamepool-leader';
const TAB_ID = Math.random().toString(36).slice(2);
export const SESSION_USER_KEY = 'mockUserId';

interface Store {
  state: MockState;
  hydrated: boolean;
  userId: string | null;
}

const emptyState = (): MockState => makeSeed(0);

export const useMockStore = create<Store>(() => ({ state: emptyState(), hydrated: false, userId: null }));

let channel: BroadcastChannel | null = null;
let started = false;

function readStorage(): MockState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MockState;
    return parsed.version === MOCK_VERSION ? parsed : null; // U6
  } catch {
    return null; // U5: corrupt/blocked → reseed
  }
}
function writeStorage(s: MockState): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* quota/blocked: keep in-memory */ }
}
function safeSession(): Storage | null {
  try { return sessionStorage; } catch { return null; }
}

export const nowMs = (): number => Date.now() + useMockStore.getState().state.demo.timeOffsetMs;

/** Latest state across tabs, falling back to in-memory. */
function latest(): MockState {
  const cur = useMockStore.getState().state;
  const stored = readStorage();
  return stored && stored.rev >= cur.rev ? stored : cur;
}

/** Apply a mutation atomically: reload → clone → mutate → persist → broadcast. */
export function commit<R>(mutate: (ctx: Ctx) => R): R {
  const s = structuredClone(latest());
  const result = mutate({ s, now: nowMs(), userId: useMockStore.getState().userId });
  s.rev += 1;
  writeStorage(s);
  useMockStore.setState({ state: s });
  try { channel?.postMessage({ rev: s.rev }); } catch { /* closed */ }
  return result;
}

function adopt(): void {
  const s = readStorage();
  if (s && s.rev > useMockStore.getState().state.rev) useMockStore.setState({ state: s });
}

export function setIdentity(userId: string | null): void {
  const ss = safeSession();
  try { if (userId) ss?.setItem(SESSION_USER_KEY, userId); else ss?.removeItem(SESSION_USER_KEY); } catch { /* ignore */ }
  useMockStore.setState({ userId });
}

export function resetAll(): void {
  const seed = makeSeed(Date.now());
  seed.rev = latest().rev + 1;
  writeStorage(seed);
  useMockStore.setState({ state: seed });
  try { channel?.postMessage({ rev: seed.rev }); } catch { /* closed */ }
}

function amLeader(): boolean {
  try {
    const raw = localStorage.getItem(LEADER_KEY);
    const lease = raw ? (JSON.parse(raw) as { id: string; ts: number }) : null;
    const now = Date.now();
    if (!lease || lease.id === TAB_ID || now - lease.ts > 30_000) {
      localStorage.setItem(LEADER_KEY, JSON.stringify({ id: TAB_ID, ts: now }));
      return true;
    }
    return false;
  } catch {
    return true;
  }
}

export function runSchedulerTick(): void {
  if (!amLeader()) return;
  // dry run first so idle ticks don't bump rev / re-render every tab
  const probe = structuredClone(latest());
  const before = JSON.stringify(probe.goals);
  const pens = evaluateDeadlines({ s: probe, now: nowMs(), userId: null });
  if (pens.length === 0 && JSON.stringify(probe.goals) === before) return;
  commit((c) => evaluateDeadlines(c));
}

/** Start sync + scheduler once per tab. Returns a stop function. */
export function startMock(): () => void {
  if (started || typeof window === 'undefined') return () => {};
  started = true;
  let s = readStorage();
  if (!s) {
    s = makeSeed(Date.now());
    writeStorage(s);
  }
  const uid = safeSession()?.getItem(SESSION_USER_KEY) ?? null;
  useMockStore.setState({ state: s, hydrated: true, userId: uid && s.users[uid] ? uid : null });

  if ('BroadcastChannel' in window) {
    channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = adopt;
  }
  const onStorage = (e: StorageEvent) => { if (e.key === STORAGE_KEY) adopt(); }; // U7 fallback
  window.addEventListener('storage', onStorage);
  runSchedulerTick();
  const timer = window.setInterval(runSchedulerTick, 15_000);
  return () => {
    started = false;
    window.clearInterval(timer);
    window.removeEventListener('storage', onStorage);
    channel?.close();
    channel = null;
  };
}
