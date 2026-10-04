// Shared plumbing for the engine: context, ids, results, feed, outbox. No reducers are registered here.
import type { InferSchema, ReducerCtx } from 'spacetimedb/server';
import type spacetimedb from './schema';
import type { ErrorCode, Result } from './shared/types';

export type Ctx = ReducerCtx<InferSchema<typeof spacetimedb>>;

export interface Env {
  ctx: Ctx;
  /** Demo clock in epoch ms: real server time plus demo_flags.time_offset_ms. */
  now: number;
  userId: string | null;
  demoMode: boolean;
}

export const FEED_LIMIT = 200;
export const DEFAULT_TZ = 'America/Detroit';
export const STARTING_BALANCE_CENTS = 20000;
export const DEFAULT_AVATAR = '/assets/avatar/01-coin-thief.png';

export const ok = <T>(data: T): Result<T> => ({ ok: true, data });
export const err = (error: ErrorCode, meta?: Record<string, unknown>): Result<never> => ({ ok: false, error, meta });

export function realNowMs(ctx: Ctx): number {
  return Math.floor(Number(ctx.timestamp.microsSinceUnixEpoch) / 1000);
}

export function flagsOf(ctx: Ctx) {
  return ctx.db.demoFlags.id.find(0);
}

export function envOf(ctx: Ctx, userId: string | null): Env {
  const f = flagsOf(ctx);
  return { ctx, now: realNowMs(ctx) + (f?.timeOffsetMs ?? 0), userId, demoMode: f?.demoMode ?? true };
}

/** The user a connection is signed in as, or null. */
export function sessionUser(ctx: Ctx): string | null {
  const s = ctx.db.session.identity.find(ctx.sender);
  return s && ctx.db.user.id.find(s.userId) ? s.userId : null;
}

function nextSeq(ctx: Ctx): number {
  const r = ctx.db.counter.name.find('seq');
  const n = (r?.n ?? 0) + 1;
  if (r) ctx.db.counter.name.update({ name: 'seq', n });
  else ctx.db.counter.insert({ name: 'seq', n });
  return n;
}

export function uid(env: Env, prefix: string): string {
  return `${prefix}_${nextSeq(env.ctx).toString(36)}`;
}

export function bindSession(env: Env, userId: string): void {
  const c = env.ctx;
  const ex = c.db.session.identity.find(c.sender);
  if (ex) c.db.session.identity.update({ ...ex, userId });
  else c.db.session.insert({ identity: c.sender, userId });
}

export function meOf(env: Env) {
  return env.userId ? env.ctx.db.user.id.find(env.userId) : null;
}

export function tzOfSquad(c: Ctx, squadId: string | null): string {
  return (squadId && c.db.squad.id.find(squadId)?.timezone) || DEFAULT_TZ;
}

export function squadMembers(c: Ctx, squadId: string) {
  return [...c.db.user.squadId.filter(squadId)];
}

export function pushFeed(
  env: Env, squadId: string, actorUserId: string | null, kind: string, text: string, at: number, meta?: Record<string, unknown>,
): void {
  const c = env.ctx;
  const seq = nextSeq(c);
  c.db.feedEvent.insert({ id: `f_${seq.toString(36)}`, seq, squadId, actorUserId: actorUserId ?? '', kind, text, createdAt: at, metaJson: meta ? JSON.stringify(meta) : '' });
  const rows = [...c.db.feedEvent.squadId.filter(squadId)];
  if (rows.length > FEED_LIMIT) {
    rows.sort((a, b) => a.createdAt - b.createdAt || a.seq - b.seq);
    for (const r of rows.slice(0, rows.length - FEED_LIMIT)) c.db.feedEvent.id.delete(r.id);
  }
}

/** Queue an external side effect. Idempotent: a second call with the same `ik` is a no-op unless the first job failed for good. */
export function enqueue(c: Ctx, kind: string, ik: string, payload: Record<string, unknown>): void {
  for (const r of c.db.outbox.ik.filter(ik)) if (r.status !== 'failed') return;
  c.db.outbox.insert({
    id: 0n, ik, kind, payload: JSON.stringify({ ik, ...payload }), status: 'pending', attempts: 0, nextTryAt: c.timestamp, createdAt: c.timestamp, result: '',
  });
}
