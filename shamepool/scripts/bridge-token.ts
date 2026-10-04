// One-time setup of the bridge identity. Run from web/:   npx tsx ../scripts/bridge-token.ts
// 1. Creates an anonymous Spacetime identity over HTTP (no SDK needed), 2. calls claim_bridge with it (first caller wins),
// 3. writes STDB_BRIDGE_TOKEN (and, if missing, NEXT_PUBLIC_STDB_URI, NEXT_PUBLIC_STDB_DB, BRIDGE_TICK_SECRET) into web/.env.local.
// It never prints a token or secret. Safe to re-run: if the stored token already is the bridge it does nothing.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(root, 'web', '.env.local');

function readEnv(): Map<string, string> {
  const m = new Map<string, string>();
  if (!existsSync(envPath)) return m;
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const i = line.indexOf('=');
    if (i > 0 && !line.trim().startsWith('#')) m.set(line.slice(0, i).trim(), line.slice(i + 1).trim());
  }
  return m;
}

/** Sets keys in .env.local, replacing existing lines in place and keeping every other line untouched. */
function writeEnv(updates: Record<string, string>): void {
  const lines = existsSync(envPath) ? readFileSync(envPath, 'utf8').split(/\r?\n/) : [];
  const seen = new Set<string>();
  const out = lines.map((line) => {
    const i = line.indexOf('=');
    const k = i > 0 ? line.slice(0, i).trim() : '';
    if (k && k in updates) { seen.add(k); return `${k}=${updates[k]}`; }
    return line;
  });
  while (out.length && out[out.length - 1] === '') out.pop();
  for (const [k, v] of Object.entries(updates)) if (!seen.has(k)) out.push(`${k}=${v}`);
  writeFileSync(envPath, out.join('\n') + '\n');
}

const env = readEnv();
const wsUri = env.get('NEXT_PUBLIC_STDB_URI') || process.env.NEXT_PUBLIC_STDB_URI || 'wss://maincloud.spacetimedb.com';
const db = env.get('NEXT_PUBLIC_STDB_DB') || process.env.NEXT_PUBLIC_STDB_DB || 'shamepool-mvp';
const http = wsUri.replace(/^ws/, 'http').replace(/\/$/, '');

async function call(token: string, reducer: string, args: unknown[]): Promise<{ ok: boolean; status: number; body: string }> {
  const r = await fetch(`${http}/v1/database/${encodeURIComponent(db)}/call/${reducer}`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(args),
  });
  return { ok: r.ok, status: r.status, body: (await r.text()).slice(0, 200) };
}

async function main(): Promise<void> {
  const updates: Record<string, string> = {};
  if (!env.has('NEXT_PUBLIC_STDB_URI')) updates.NEXT_PUBLIC_STDB_URI = wsUri;
  if (!env.has('NEXT_PUBLIC_STDB_DB')) updates.NEXT_PUBLIC_STDB_DB = db;
  if (!env.get('BRIDGE_TICK_SECRET')) updates.BRIDGE_TICK_SECRET = randomBytes(24).toString('hex');

  const existing = env.get('STDB_BRIDGE_TOKEN');
  if (existing) {
    // Probe: only the bridge identity may call outbox_requeue (unknown job ids are ignored).
    const probe = await call(existing, 'outbox_requeue', [0, 0, '']);
    if (probe.ok) {
      if (Object.keys(updates).length) writeEnv(updates);
      console.log(`Bridge token in web/.env.local already is the bridge identity of "${db}". Nothing to claim.`);
      return;
    }
  }

  const idRes = await fetch(`${http}/v1/identity`, { method: 'POST' });
  if (!idRes.ok) throw new Error(`Could not create an identity: HTTP ${idRes.status}`);
  const { identity, token } = (await idRes.json()) as { identity: string; token: string };
  const claim = await call(token, 'claim_bridge', []);
  if (!claim.ok) {
    if (/already_claimed/.test(claim.body)) {
      console.error(
        `The bridge of "${db}" is already claimed by another identity and web/.env.local has no valid token for it.\n` +
        'Fix: republish with  spacetime publish ' + db + ' --module-path spacetimedb --delete-data=always --yes  (wipes data, reseeds), then rerun this script.',
      );
    } else {
      console.error(`claim_bridge failed: HTTP ${claim.status} ${claim.body}`);
    }
    process.exit(1);
  }
  updates.STDB_BRIDGE_TOKEN = token;
  writeEnv(updates);
  console.log(`Claimed the bridge of "${db}" as identity ${identity.slice(0, 10)}... and saved STDB_BRIDGE_TOKEN to web/.env.local.`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
