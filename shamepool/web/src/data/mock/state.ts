import type {
  Account, BotThreadMessage, CashoutProposal, Checkin, DemoFlags, ErrorCode, FeedEvent, Goal, PendingAction, Penalty, Result, Squad, User,
} from '../types';

export const MOCK_VERSION = 2;
export const STORAGE_KEY = 'shamepool-mock-v1';

export interface MockState {
  version: number;
  users: Record<string, User>;
  accounts: Record<string, Account>; // key = lowercase username
  authAttempts: Record<string, { n: number; until: number }>;
  resetTokens: Record<string, { token: string; expires: number }>;
  squads: Record<string, Squad>;
  goals: Record<string, Goal>;
  checkins: Record<string, Checkin>;
  penalties: Record<string, Penalty>; // key = penaltyKey(goalId, date)
  feed: FeedEvent[]; // newest first
  cashouts: Record<string, CashoutProposal>;
  botThreads: Record<string, BotThreadMessage[]>;
  pendingActions: Record<string, PendingAction & { userId: string }>;
  milestones: Record<string, true>;
  msgTimes: Record<string, number[]>;
  seedUserIds: string[];
  demo: DemoFlags;
  seq: number;
  rev: number; // bumped on every commit, used by sync
}

export interface Ctx {
  s: MockState;
  now: number;
  userId: string | null;
}

export const ok = <T>(data: T): Result<T> => ({ ok: true, data });
export const err = (error: ErrorCode, meta?: Record<string, unknown>): Result<never> => ({ ok: false, error, meta });

export function uid(s: MockState, prefix: string): string {
  return `${prefix}_${(s.seq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

export const FEED_LIMIT = 200;

export function pushFeed(
  s: MockState, squadId: string, actorUserId: string | null, kind: FeedEvent['kind'], text: string, now: number, meta?: Record<string, unknown>,
): FeedEvent {
  const ev: FeedEvent = { id: uid(s, 'f'), squadId, actorUserId, kind, text, createdAt: now, meta };
  s.feed.unshift(ev);
  if (s.feed.length > FEED_LIMIT) s.feed.length = FEED_LIMIT;
  return ev;
}

export function squadMembers(s: MockState, squadId: string): User[] {
  return Object.values(s.users).filter((u) => u.squadId === squadId);
}
