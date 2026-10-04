/* eslint-disable @typescript-eslint/no-explicit-any */
// Raw probe of the real Nessie sandbox. Usage (from web/): npx tsx ../scripts/nessie-probe.ts
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from './_env';

loadEnv();
const KEY = process.env.NESSIE_API_KEY ?? '';
const BASE = process.env.NESSIE_BASE_URL ?? 'https://api.nessieisreal.com';
const log: Array<Record<string, unknown>> = [];
const redact = (s: string) => (KEY ? s.split(KEY).join('[REDACTED]') : s);

async function call(label: string, method: string, p: string, body?: unknown) {
  const url = `${BASE}${p}${p.includes('?') ? '&' : '?'}key=${KEY}`;
  const t0 = Date.now();
  let status = 0;
  let json: unknown = null;
  let text = '';
  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    status = res.status;
    text = await res.text();
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  } catch (e) {
    text = `NETWORK ERROR: ${(e as Error).message}`;
  }
  const entry = { label, method, path: p, request: body ?? null, status, ms: Date.now() - t0, response: json ?? redact(text).slice(0, 500) };
  log.push(JSON.parse(redact(JSON.stringify(entry))));
  console.log(`${label}: ${method} ${p} -> ${status} (${entry.ms}ms)`);
  return { status, json: json as Record<string, any> | null };
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const today = new Date().toISOString().slice(0, 10);

async function main() {
  console.log(`key present: ${KEY.length > 0} (length ${KEY.length})`);
  if (!KEY) throw new Error('NESSIE_API_KEY missing');
  const list = await call('list customers', 'GET', '/customers');
  if (list.status !== 200) {
    console.log('API not usable (status ' + list.status + '). Stopping.');
    return;
  }
  const cust = await call('create customer', 'POST', '/customers', {
    first_name: 'Probe',
    last_name: 'Customer',
    address: { street_number: '500', street_name: 'S State St', city: 'Ann Arbor', state: 'MI', zip: '48109' },
  });
  const cid = cust.json?.objectCreated?._id;
  if (!cid) return;
  const mk = (balance: number, nickname: string) =>
    call('create account ' + nickname, 'POST', `/customers/${cid}/accounts`, { type: 'Checking', nickname, rewards: 0, balance });
  const a = await mk(100, 'FT-probe-A');
  const b = await mk(0, 'FT-probe-B');
  const dec = await mk(12.34, 'FT-probe-dec');
  const aid = a.json?.objectCreated?._id;
  const bid = b.json?.objectCreated?._id;
  const did = dec.json?.objectCreated?._id;
  const bal = async (label: string, id: string) => {
    const r = await call(label, 'GET', `/accounts/${id}`);
    console.log('   balance =', r.json?.balance);
    return r.json?.balance;
  };
  if (!aid || !bid) return;
  await bal('A start', aid);
  await bal('B start', bid);
  if (did) await bal('dec account', did);

  const tr = (extra: object, amount = 5) =>
    call('transfer ' + amount, 'POST', `/accounts/${aid}/transfers`, {
      amount, transaction_date: today, status: 'pending', description: 'probe [ik:probe-1]', ...extra,
    });
  const t1 = await tr({});
  await bal('A after t1 (0s)', aid);
  await bal('B after t1 (0s)', bid);
  await sleep(3000);
  await bal('A after t1 (3s)', aid);
  await bal('B after t1 (3s)', bid);
  await tr({ status: 'completed' });
  await bal('A after t2 completed', aid);
  await bal('B after t2 completed', bid);
  await tr({ status: 'completed' }, 1.5);
  await bal('A after decimal transfer', aid);
  await tr({ status: 'completed' }, 500);
  await tr({ status: 'completed' }, 0);
  await tr({ status: 'completed' }, -1);
  await call('transfer with payee_id (rejected: no payee field in sandbox)', 'POST', `/accounts/${aid}/transfers`, { payee_id: bid, amount: 1, transaction_date: today, status: 'completed', description: 'x' });
  await call('transfer with medium (rejected)', 'POST', `/accounts/${aid}/transfers`, { medium: 'balance', amount: 1, transaction_date: today, status: 'completed', description: 'x' });
  await call('get missing account', 'GET', '/accounts/000000000000000000000000');
  await call('get t1', 'GET', `/transfers/${t1.json?.objectCreated?._id}`);

  const m = await call('create merchant', 'POST', '/merchants', {
    name: 'FT Probe Pizza',
    category: 'food',
    address: { street_number: '1', street_name: 'Main St', city: 'Ann Arbor', state: 'MI', zip: '48104' },
    geocode: { lat: 42.28, lng: -83.74 },
  });
  const mid = m.json?.objectCreated?._id;
  await call('purchase', 'POST', `/accounts/${aid}/purchases`, { merchant_id: mid, medium: 'balance', purchase_date: today, amount: 3, status: 'pending', description: 'probe [ik:probe-p]' });
  await bal('A after purchase', aid);
  await call('purchase completed', 'POST', `/accounts/${aid}/purchases`, { merchant_id: mid, medium: 'balance', purchase_date: today, amount: 2, status: 'completed', description: 'probe [ik:probe-p2]' });
  await bal('A after purchase2', aid);
  await call('withdrawal', 'POST', `/accounts/${aid}/withdrawals`, { medium: 'balance', transaction_date: today, amount: 4, status: 'completed', description: 'probe [ik:probe-w]' });
  await bal('A after withdrawal', aid);
  await call('deposit', 'POST', `/accounts/${aid}/deposits`, { medium: 'balance', transaction_date: today, amount: 1, status: 'completed', description: 'probe [ik:probe-d]' });
  await bal('A after deposit', aid);
  await call('list transfers payer', 'GET', `/accounts/${aid}/transfers?type=payer`);
  await call('list transfers payee', 'GET', `/accounts/${bid}/transfers?type=payee`);
  await call('list purchases', 'GET', `/accounts/${aid}/purchases`);
  await call('list withdrawals', 'GET', `/accounts/${aid}/withdrawals`);
  await call('list deposits', 'GET', `/accounts/${aid}/deposits`);
  await call('list accounts', 'GET', `/customers/${cid}/accounts`);
  const t0 = Date.now();
  const codes: number[] = [];
  for (let i = 0; i < 15; i++) codes.push((await call('rate ' + i, 'GET', `/accounts/${aid}`)).status);
  console.log('rate burst codes', codes.join(','), Date.now() - t0, 'ms');
  for (const id of [aid, bid, did]) if (id) await call('delete account', 'DELETE', `/accounts/${id}`);
  await call('get deleted account', 'GET', `/accounts/${aid}`);
  await call('delete customer', 'DELETE', `/customers/${cid}`);
  await call('delete merchant', 'DELETE', `/merchants/${mid}`);
}

main()
  .catch((e) => console.log('probe error:', redact(String(e))))
  .finally(() => {
    const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'nessie-probe-output.json');
    mkdirSync(path.dirname(out), { recursive: true });
    writeFileSync(out, redact(JSON.stringify({ base: BASE, ranAt: new Date().toISOString(), calls: log }, null, 2)));
    console.log('wrote', out);
  });
