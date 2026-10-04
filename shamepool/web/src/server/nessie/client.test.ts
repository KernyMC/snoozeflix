import { describe, expect, it } from 'vitest';
import { centsToNessieAmount, createNessieClient, ikToken, nessieAmountToCents, redact, withIk } from './client';
import { createMockFetch, createMockNessie, createMockStore } from './mock';
import { NessieError } from './types';

const KEY = 'sup3r-secret-key-1234567890abcdef';

describe('cents conversion', () => {
  it('rounds half up to whole dollars with a $1 floor', () => {
    expect(centsToNessieAmount(500)).toBe(5);
    expect(centsToNessieAmount(549)).toBe(5);
    expect(centsToNessieAmount(550)).toBe(6);
    expect(centsToNessieAmount(30)).toBe(1);
    expect(centsToNessieAmount(20000)).toBe(200);
    expect(centsToNessieAmount(0, { allowZero: true })).toBe(0);
    expect(nessieAmountToCents(12)).toBe(1200);
  });
  it('rejects zero, negative and fractional cents', () => {
    for (const bad of [0, -5, 1.5, NaN]) {
      expect(() => centsToNessieAmount(bad)).toThrow(NessieError);
    }
  });
});

describe('idempotency token', () => {
  it('embeds one [ik:...] token and replaces an old one', () => {
    expect(withIk('hello', 'a:b')).toBe('hello [ik:a:b]');
    expect(withIk('hello [ik:old]', 'new')).toBe('hello [ik:new]');
    expect(() => ikToken('bad key]')).toThrow(NessieError);
  });
});

describe('redaction', () => {
  it('strips key= params and the literal key', () => {
    expect(redact(`GET https://x/y?key=${KEY}&a=1`, KEY)).not.toContain(KEY);
    expect(redact(`oops ${KEY} here`, KEY)).toBe('oops [REDACTED] here');
    expect(redact('https://x?foo=1&key=abc', undefined)).toBe('https://x?foo=1&key=[REDACTED]');
  });
  it('never leaks the key in thrown errors (HTTP error and network error)', async () => {
    const http = createNessieClient({
      apiKey: KEY,
      fetchImpl: async (u) => new Response(`bad request for ${u}`, { status: 400 }),
    });
    const err1 = await http.getAccount('abc').catch((e) => e);
    expect(err1).toBeInstanceOf(NessieError);
    expect(JSON.stringify(err1) + err1.message + String(err1.stack ?? '').slice(0, 0)).not.toContain(KEY);
    const net = createNessieClient({
      apiKey: KEY,
      retryDelayMs: 1,
      fetchImpl: async (u) => {
        throw new Error(`connect failed ${u}`);
      },
    });
    const err2 = await net.getAccount('abc').catch((e) => e);
    expect(err2.code).toBe('network');
    expect(err2.message).not.toContain(KEY);
  });
  it('sends the key only as a query parameter', async () => {
    const seen: Array<{ url: string; headers: unknown }> = [];
    const c = createNessieClient({
      apiKey: KEY,
      fetchImpl: async (u, init) => {
        seen.push({ url: u, headers: init?.headers });
        return new Response('[]', { status: 200 });
      },
    });
    await c.listCustomers();
    expect(seen[0].url).toContain(`key=${KEY}`);
    expect(JSON.stringify(seen[0].headers)).not.toContain(KEY);
  });
  it('refuses to build a client without a key', () => {
    expect(() => createNessieClient({ apiKey: '' })).toThrow(/NESSIE_API_KEY/);
  });
});

describe('error mapping', () => {
  const mk = (status: number, body: string, calls?: { n: number }) =>
    createNessieClient({
      apiKey: KEY,
      retryDelayMs: 1,
      fetchImpl: async () => {
        if (calls) calls.n++;
        return new Response(body, { status });
      },
    });

  it('maps pydantic validation strings to code=validation with culprit fields', async () => {
    const e = await mk(400, JSON.stringify('2 validation errors for TransferCreate\nstatus\n  field required (type=value_error.missing)\namount\n  field required (type=value_error.missing)'))
      .getAccount('x')
      .catch((x) => x);
    expect(e.status).toBe(400);
    expect(e.code).toBe('validation');
    expect(e.culprit).toEqual(['status', 'amount']);
    expect(e.retryable).toBe(false);
  });
  it('maps empty 404 and 403 message bodies', async () => {
    const e404 = await mk(404, '').getAccount('x').catch((x) => x);
    expect([e404.status, e404.code]).toEqual([404, 'not_found']);
    const e403 = await mk(403, JSON.stringify({ message: 'Missing Authentication Token' })).getAccount('x').catch((x) => x);
    expect([e403.status, e403.code]).toEqual([403, 'forbidden']);
  });
  it('retries once on 5xx for GET, not on 4xx', async () => {
    const c5 = { n: 0 };
    const e5 = await mk(503, 'down', c5).getAccount('x').catch((x) => x);
    expect(c5.n).toBe(2);
    expect(e5.retryable).toBe(true);
    const c4 = { n: 0 };
    await mk(400, '"nope"', c4).getAccount('x').catch(() => undefined);
    expect(c4.n).toBe(1);
  });
  it('times out and marks the error retryable', async () => {
    const c = createNessieClient({
      apiKey: KEY,
      timeoutMs: 20,
      retryDelayMs: 1,
      fetchImpl: (_u, init) =>
        new Promise((_res, rej) => {
          init?.signal?.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })));
        }),
    });
    const e = await c.getAccount('x').catch((x) => x);
    expect(e.code).toBe('timeout');
    expect(e.retryable).toBe(true);
  });
  it('lists treat the sandbox 404 "No transfers found" as empty', async () => {
    const c = mk(404, JSON.stringify('No transfers found for this account'));
    await expect(c.listTransfers('acc')).resolves.toEqual([]);
  });
});

describe('mock twin (real-sandbox fidelity)', () => {
  it('creates customers/accounts, truncates nothing we send, and keeps balances static on transfers', async () => {
    const n = createMockNessie({ store: createMockStore() });
    const { customerId } = await n.createCustomer({ firstName: 'A', lastName: 'B' });
    const a = (await n.createAccount(customerId, { nickname: 'FT-a', startingBalanceCents: 10000 })).accountId;
    const b = (await n.createAccount(customerId, { nickname: 'FT-b' })).accountId;
    expect((await n.getAccount(a)).balanceCents).toBe(10000);
    const t = await n.transfer({ fromAccountId: a, toAccountId: b, amountCents: 500, description: 'x', idempotencyKey: 'k1' });
    expect(t.created).toBe(true);
    expect((await n.getAccount(a)).balanceCents).toBe(10000);
    expect((await n.getAccount(b)).balanceCents).toBe(0);
    const list = await n.listTransfers(a);
    expect(list).toHaveLength(1);
    expect(list[0].description).toContain(`-> ${b}`);
    expect(list[0].amountDollars).toBe(5);
  });

  it('transfer is idempotent: same ik twice -> one ledger entry, same id', async () => {
    const n = createMockNessie({ store: createMockStore() });
    const { customerId } = await n.createCustomer({ firstName: 'A', lastName: 'B' });
    const a = (await n.createAccount(customerId, { nickname: 'FT-a', startingBalanceCents: 10000 })).accountId;
    const b = (await n.createAccount(customerId, { nickname: 'FT-b' })).accountId;
    const in1 = { fromAccountId: a, toAccountId: b, amountCents: 1000, description: 'p', idempotencyKey: 'pen-1' };
    const t1 = await n.transfer(in1);
    const t2 = await n.transfer(in1);
    expect(t2.created).toBe(false);
    expect(t2.transferId).toBe(t1.transferId);
    expect(await n.listTransfers(a)).toHaveLength(1);
    await n.transfer({ ...in1, idempotencyKey: 'pen-2' });
    expect(await n.listTransfers(a)).toHaveLength(2);
  });

  it('recovers when a create POST fails after being applied (re-checks before retrying)', async () => {
    const store = createMockStore();
    const base = createMockFetch(store);
    let dropped = false;
    const flaky = async (u: string, init?: RequestInit) => {
      const res = await base(u, init);
      if (!dropped && init?.method === 'POST' && u.includes('/withdrawals')) {
        dropped = true;
        throw new Error('connection reset');
      }
      return res;
    };
    const c = createNessieClient({ apiKey: 'k', baseUrl: 'http://nessie.mock', fetchImpl: flaky, retryDelayMs: 1 });
    const { customerId } = await c.createCustomer({ firstName: 'A', lastName: 'B' });
    const a = (await c.createAccount(customerId, { nickname: 'FT-a', startingBalanceCents: 5000 })).accountId;
    const w = await c.withdraw({ accountId: a, amountCents: 700, description: 'w', idempotencyKey: 'w-1' });
    expect(dropped).toBe(true);
    expect(w.created).toBe(false);
    expect(await c.listWithdrawals(a)).toHaveLength(1);
  });

  it('applyBalances mode moves money and rejects overdrafts with 400', async () => {
    const n = createMockNessie({ store: createMockStore(), applyBalances: true });
    const { customerId } = await n.createCustomer({ firstName: 'A', lastName: 'B' });
    const a = (await n.createAccount(customerId, { nickname: 'FT-a', startingBalanceCents: 1000 })).accountId;
    const b = (await n.createAccount(customerId, { nickname: 'FT-b' })).accountId;
    await n.withdraw({ accountId: a, amountCents: 300, description: 'w', idempotencyKey: 'w' });
    expect((await n.getAccount(a)).balanceCents).toBe(700);
    await n.deposit({ accountId: b, amountCents: 300, description: 'd', idempotencyKey: 'd' });
    expect((await n.getAccount(b)).balanceCents).toBe(300);
    const err = await n.withdraw({ accountId: a, amountCents: 5000, description: 'big', idempotencyKey: 'big' }).catch((e) => e);
    expect(err).toBeInstanceOf(NessieError);
    expect(err.status).toBe(400);
    expect(err.retryable).toBe(false);
    expect((await n.getAccount(a)).balanceCents).toBe(700);
  });

  it('a wrong key sees an empty tenant (like the real sandbox)', async () => {
    const store = createMockStore();
    const good = createMockNessie({ store, apiKey: 'good' });
    const bad = createMockNessie({ store, apiKey: 'bad' });
    await good.createCustomer({ firstName: 'A', lastName: 'B' });
    expect(await good.listCustomers()).toHaveLength(1);
    expect(await bad.listCustomers()).toHaveLength(0);
  });

  it('injected 503s are retried once for reads', async () => {
    const opts = { store: createMockStore(), failNext: { count: 1, status: 503 } };
    const n = createMockNessie(opts);
    await expect(n.listCustomers()).resolves.toEqual([]);
    expect(opts.failNext.count).toBe(0);
  });
});
