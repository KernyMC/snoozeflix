// SERVER ONLY. The bridge between Spacetime and Nessie. It talks to Spacetime over its HTTP API (SQL + reducer calls) with the
// bridge identity's token, which works on any serverless runtime (no WebSocket needed), drains the `outbox`, calls
// handleNessieJob for each due job and reports back with outbox_done / outbox_fail / outbox_requeue.
// Only the bridge identity can read bridge_outbox / bridge_links or call those reducers (checked inside the module).
import { handleNessieJob, type OutboxJob } from '@/server/nessie/handlers';

const WS_URI = process.env.NEXT_PUBLIC_STDB_URI || 'wss://maincloud.spacetimedb.com';
const DB = process.env.NEXT_PUBLIC_STDB_DB || 'shamepool-mvp';
const HTTP = WS_URI.replace(/^ws/, 'http').replace(/\/$/, '');

export class BridgeConfigError extends Error {}

function token(): string {
  const t = process.env.STDB_BRIDGE_TOKEN;
  if (!t) throw new BridgeConfigError('STDB_BRIDGE_TOKEN is not set (run scripts/bridge-token.ts)');
  return t;
}

async function http(path: string, init: RequestInit): Promise<Response> {
  return fetch(`${HTTP}/v1/database/${encodeURIComponent(DB)}${path}`, {
    ...init, cache: 'no-store', headers: { ...(init.headers ?? {}), authorization: `Bearer ${token()}` },
  });
}

interface SqlResult { schema: { elements: { name: { some?: string } }[] }; rows: unknown[][] }

/** Runs one SQL query as the bridge identity and returns rows keyed by column name. */
export async function sqlRows(query: string): Promise<Record<string, unknown>[]> {
  const res = await http('/sql', { method: 'POST', body: query });
  if (!res.ok) throw new Error(`Spacetime SQL failed: HTTP ${res.status}`);
  const [first] = (await res.json()) as SqlResult[];
  if (!first) return [];
  const names = first.schema.elements.map((e) => e.name.some ?? '');
  return first.rows.map((row) => Object.fromEntries(row.map((v, i) => [names[i], v])));
}

/** Calls a reducer as the bridge identity. Args are the reducer's positional arguments. */
export async function callReducer(name: string, args: unknown[]): Promise<void> {
  const res = await http(`/call/${name}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(args) });
  if (!res.ok) throw new Error(`Spacetime reducer ${name} failed: HTTP ${res.status} ${(await res.text()).slice(0, 160)}`);
}

interface Row { id: number; kind: string; payload: string; attempts: number; nextTryMicros: number }

const micros = (v: unknown): number => (Array.isArray(v) ? Number(v[0]) : Number(v));

async function pendingJobs(): Promise<Row[]> {
  const rows = await sqlRows('SELECT * FROM bridge_outbox');
  const nowMicros = Date.now() * 1000;
  return rows
    .map((r) => ({ id: Number(r.id), kind: String(r.kind), payload: String(r.payload), attempts: Number(r.attempts), nextTryMicros: micros(r.next_try_at) }))
    .filter((r) => r.nextTryMicros <= nowMicros)
    .sort((a, b) => a.id - b.id);
}

type Links = Map<string, string>; // 'u:<userId>' | 's:<squadId>' -> Nessie accountId

async function loadLinks(): Promise<Links> {
  const rows = await sqlRows('SELECT * FROM bridge_links');
  return new Map(rows.map((r) => [String(r.key), String(r.account_id)]));
}

class NotReady extends Error {}

/** Fills the Nessie account ids a job needs from the links table; throws NotReady if they are not provisioned yet. */
function resolvePayload(kind: string, p: Record<string, unknown>, links: Links): Record<string, unknown> {
  const need = (key: string): string => {
    const id = links.get(key);
    if (!id) throw new NotReady(`waiting for Nessie account ${key}`);
    return id;
  };
  switch (kind) {
    case 'nessie_transfer': return { ...p, fromAccountId: need(`u:${p.userId}`), toAccountId: need(`s:${p.squadId}`) };
    case 'nessie_withdraw': return { ...p, accountId: need(`u:${p.userId}`) };
    case 'nessie_purchase': return { ...p, poolAccountId: need(`s:${p.squadId}`) };
    default: return p;
  }
}

export interface DrainReport { seen: number; done: number; failed: number; requeued: number }

let running: Promise<DrainReport> | null = null;

/** Drains due outbox jobs, one at a time and in id order. Concurrent callers share the run that is already in flight. */
export function drainOutbox(opts: { maxJobs?: number; budgetMs?: number } = {}): Promise<DrainReport> {
  if (running) return running;
  running = doDrain(opts).finally(() => { running = null; });
  return running;
}

async function doDrain({ maxJobs = 12, budgetMs = 25_000 }: { maxJobs?: number; budgetMs?: number }): Promise<DrainReport> {
  const report: DrainReport = { seen: 0, done: 0, failed: 0, requeued: 0 };
  const started = Date.now();
  const jobs = (await pendingJobs()).slice(0, maxJobs);
  report.seen = jobs.length;
  if (!jobs.length) return report;
  const links = await loadLinks();
  for (const job of jobs) {
    if (Date.now() - started > budgetMs) break;
    let payload: Record<string, unknown>;
    try { payload = JSON.parse(job.payload) as Record<string, unknown>; } catch { payload = {}; }
    try {
      const out: OutboxJob = { id: String(job.id), kind: job.kind, payload: resolvePayload(job.kind, payload, links), attempts: job.attempts };
      const result = await handleNessieJob(out);
      await callReducer('outbox_done', [job.id, JSON.stringify(result ?? {})]);
      if (job.kind === 'nessie_create_user' && result.accountId) links.set(`u:${payload.userId}`, String(result.accountId));
      if (job.kind === 'nessie_create_pool' && result.accountId) links.set(`s:${payload.squadId}`, String(result.accountId));
      report.done++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      try {
        if (e instanceof NotReady) {
          await callReducer('outbox_requeue', [job.id, 5000, msg]);
          report.requeued++;
        } else {
          const retryable = (e as { retryable?: boolean }).retryable !== false;
          await callReducer('outbox_fail', [job.id, msg.slice(0, 400), retryable]);
          report.failed++;
        }
      } catch (inner) {
        console.warn('[bridge] could not report job result', job.id, inner instanceof Error ? inner.message : inner);
      }
    }
  }
  if (report.done || report.failed) console.log(`[bridge] outbox: ${report.done} done, ${report.failed} failed, ${report.requeued} requeued of ${report.seen}`);
  return report;
}
