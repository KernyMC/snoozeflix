// SERVER ONLY (see types.ts). In-memory twin of the Nessie sandbox, implemented as a fake `fetch` so the real client
// code (retry, redaction, idempotency, error mapping) runs unchanged against it.
//
// Fidelity: copies the REAL sandbox quirks verified by scripts/nessie-probe.ts:
//  - balances never change on transfers/purchases/withdrawals/deposits (pure ledger),
//  - decimals truncated to integers, no overdraft check, free-form status,
//  - transfers have no payee, list items use `id` (not `_id`), empty lists answer 404,
//  - validation errors are bare strings, a wrong key silently sees an empty tenant.
// Opt in to `applyBalances: true` for a bank-like twin that moves balances and rejects overdrafts (400).
import { createNessieClient } from './client';
import type { NessieClient } from './types';

export interface MockOptions {
  /** Simulate a real bank: transfers/purchases/withdrawals/deposits move balances; overdraft -> 400. Default false. */
  applyBalances?: boolean;
  /** Artificial latency range in ms. Default 0 (tests) ; the factory in index.ts uses 150-400. */
  latencyMs?: [number, number];
  /** Force the next N requests to fail with this status (for retry tests). */
  failNext?: { count: number; status: number };
}

interface Store {
  customers: Map<string, Json>;
  accounts: Map<string, Json>;
  merchants: Map<string, Json>;
  ledger: Map<string, { kind: string; accountId: string; row: Json }[]>;
  seq: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

const g = globalThis as unknown as { __nessieMockStore?: Store };

function freshStore(): Store {
  return { customers: new Map(), accounts: new Map(), merchants: new Map(), ledger: new Map(), seq: 0 };
}

/** Process-wide store so Next.js hot reload keeps state (like the charter asks). Tests pass their own. */
export function sharedMockStore(): Store {
  return (g.__nessieMockStore ??= freshStore());
}
export function createMockStore(): Store {
  return freshStore();
}

const json = (status: number, body: unknown) =>
  new Response(typeof body === 'string' ? JSON.stringify(body) : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

function missing(model: string, fields: string[]): Response {
  const n = fields.length;
  return json(400, `${n} validation error${n > 1 ? 's' : ''} for ${model}\n${fields.map((f) => `${f}\n  field required (type=value_error.missing)`).join('\n')}`);
}

export function createMockFetch(store: Store = sharedMockStore(), options: MockOptions = {}) {
  const opts = options;
  const id = () => {
    store.seq += 1;
    const h = (n: number) => Math.floor(Math.random() * 16 ** n).toString(16).padStart(n, '0');
    return `${h(8)}-${h(4)}-4${h(3)}-a${h(3)}-${h(12)}`;
  };

  function handle(method: string, url: URL, body: Json): Response {
    const key = url.searchParams.get('key') ?? '';
    // Wrong/empty key: the real sandbox answers 200 with an empty tenant. Tenant = key string.
    const tenant = key;
    const parts = url.pathname.split('/').filter(Boolean);
    const [root, a1, sub, a3] = parts;
    const date = new Date().toISOString().slice(0, 10);
    const owned = (m: Map<string, Json>) => [...m.values()].filter((r) => r.__tenant === tenant);
    const strip = (r: Json) => {
      const { __tenant, ...rest } = r;
      void __tenant;
      return rest;
    };

    if (root === 'customers') {
      if (!a1) {
        if (method === 'GET') return json(200, owned(store.customers).map(strip));
        if (method === 'POST') {
          const miss = ['first_name', 'last_name', 'address'].filter((f) => body?.[f] === undefined);
          if (miss.length) return missing('CustomerCreate', miss);
          const row = { ...body, _id: id(), __tenant: tenant };
          store.customers.set(row._id, row);
          return json(201, { code: 201, message: 'Customer created', objectCreated: strip(row) });
        }
      } else if (!sub) {
        const c = store.customers.get(a1);
        if (method === 'GET') return c && c.__tenant === tenant ? json(200, strip(c)) : json(404, '');
        if (method === 'DELETE') return json(403, { message: 'Missing Authentication Token' });
      } else if (sub === 'accounts') {
        const c = store.customers.get(a1);
        if (method === 'GET') {
          if (!c || c.__tenant !== tenant) return json(404, '');
          return json(200, owned(store.accounts).filter((x) => x.customer_id === a1).map(strip));
        }
        if (method === 'POST') {
          if (!c || c.__tenant !== tenant) return json(404, '');
          const miss = ['type', 'nickname', 'rewards', 'balance'].filter((f) => body?.[f] === undefined);
          if (miss.length) return missing('AccountCreate', miss);
          const row = {
            type: body.type, nickname: body.nickname, rewards: Math.trunc(body.rewards), balance: Math.trunc(body.balance),
            _id: id(), account_number: String(Math.floor(Math.random() * 1e16)).padStart(16, '0'), customer_id: a1, __tenant: tenant,
          };
          store.accounts.set(row._id, row);
          return json(201, { code: 201, message: 'Account created', objectCreated: strip(row) });
        }
      }
    }

    if (root === 'accounts' && a1) {
      const acct = store.accounts.get(a1);
      const mine = acct && acct.__tenant === tenant ? acct : undefined;
      if (!sub) {
        if (method === 'GET') return mine ? json(200, strip(mine)) : json(404, '');
        if (method === 'DELETE') {
          if (!mine) return json(404, '');
          store.accounts.delete(a1);
          return json(200, '');
        }
        if (method === 'PUT') {
          if (!mine) return json(404, '');
          if (body?.nickname === undefined) return missing('AccountUpdate', ['nickname']);
          mine.nickname = body.nickname;
          return json(202, { code: 202, message: 'Accepted account update', objectUpdated: strip(mine) });
        }
      }
      const kinds: Record<string, { model: string; need: string[]; label: string; singular: string }> = {
        transfers: { model: 'TransferCreate', need: ['transaction_date', 'status', 'amount', 'description'], label: 'Transfer', singular: 'transfer' },
        deposits: { model: 'DepositCreate', need: ['medium', 'transaction_date', 'status', 'description', 'amount'], label: 'Deposit', singular: 'deposit' },
        withdrawals: { model: 'WithdrawalCreate', need: ['medium', 'transaction_date', 'status', 'amount', 'description'], label: 'Withdrawal', singular: 'withdrawal' },
        purchases: { model: 'PurchaseCreate', need: ['merchant_id', 'medium', 'amount'], label: 'Purchase', singular: 'purchase' },
      };
      const k = sub ? kinds[sub] : undefined;
      if (k && !a3) {
        const rows = store.ledger.get(a1) ?? [];
        if (method === 'GET') {
          if (!mine) return json(404, '');
          const mineRows = rows.filter((r) => r.kind === sub);
          if (!mineRows.length) {
            return json(404, sub === 'transfers' ? 'No transfers found for this account' : sub === 'purchases' ? 'No purchases found for this account' : `No ${sub} found for this account`);
          }
          if (sub === 'purchases') {
            const bad = mineRows.find((r) => typeof r.row.merchant_id !== 'string' || r.row.merchant_id.length < 24);
            if (bad) return json(400, 'validation error for Purchase\nmerchant_id\n  ensure this value has at least 24 characters (type=value_error.any_str.min_length; limit_value=24)');
          }
          // transfers list uses `id`, the others `_id` (real quirk)
          return json(200, mineRows.map((r) => (sub === 'transfers' ? { id: r.row._id, ...r.row, _id: undefined } : r.row)).reverse());
        }
        if (method === 'POST') {
          if (!mine) return json(404, '');
          const extra = Object.keys(body ?? {}).filter((f) => !k.need.concat(['description', 'amount', 'status', 'purchase_date', 'medium', 'merchant_id', 'transaction_date']).includes(f));
          const rejectedExtra = sub === 'transfers' ? Object.keys(body ?? {}).filter((f) => !['transaction_date', 'status', 'amount', 'description'].includes(f)) : extra;
          if (rejectedExtra.length) {
            return json(400, `${rejectedExtra.length} validation errors for ${k.model}\n${rejectedExtra.map((f) => `${f}\n  extra fields not permitted (type=value_error.extra)`).join('\n')}`);
          }
          const miss = k.need.filter((f) => body?.[f] === undefined);
          if (miss.length) return missing(k.model, miss);
          const amount = Math.trunc(Number(body.amount));
          if (opts.applyBalances) {
            if (amount <= 0) return json(400, 'amount must be positive');
            const debit = sub !== 'deposits';
            if (debit && mine.balance < amount) return json(400, 'Insufficient balance');
            mine.balance += debit ? -amount : amount;
          }
          const row: Json = { ...body, amount, _id: id() };
          if (sub === 'purchases') Object.assign(row, { type: 'merchant', payer_id: a1 });
          if (sub === 'withdrawals') Object.assign(row, { type: 'withdrawal', payer_id: a1, creation_date: date });
          if (sub === 'deposits') Object.assign(row, { creation_date: date });
          rows.push({ kind: sub!, accountId: a1, row });
          store.ledger.set(a1, rows);
          return json(201, { code: 201, message: `${k.label} created`, objectCreated: row });
        }
      }
    }

    if (root === 'merchants') {
      if (!a1) {
        if (method === 'GET') return json(200, owned(store.merchants).map(strip));
        if (method === 'POST') {
          const miss = ['name'].filter((f) => body?.[f] === undefined);
          if (miss.length) return missing('MerchantCreate', miss);
          const row = { ...body, _id: id(), __tenant: tenant };
          store.merchants.set(row._id, row);
          return json(201, { code: 201, message: 'Merchant created', objectCreated: strip(row) });
        }
      } else if (method === 'GET') {
        const m = store.merchants.get(a1);
        return m && m.__tenant === tenant ? json(200, strip(m)) : json(404, '');
      } else if (method === 'DELETE') return json(403, { message: 'Missing Authentication Token' });
    }
    return json(403, { message: 'Missing Authentication Token' });
  }

  const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  return async function mockFetch(input: string, init?: RequestInit): Promise<Response> {
    if (opts.latencyMs) {
      const [lo, hi] = opts.latencyMs;
      await wait(lo + Math.random() * (hi - lo));
    }
    if (opts.failNext && opts.failNext.count > 0) {
      opts.failNext.count -= 1;
      return json(opts.failNext.status, { message: 'injected failure' });
    }
    const url = new URL(input);
    const body = typeof init?.body === 'string' && init.body ? JSON.parse(init.body) : undefined;
    return handle((init?.method ?? 'GET').toUpperCase(), url, body);
  };
}

export function createMockNessie(options: MockOptions & { store?: Store; apiKey?: string } = {}): NessieClient {
  return createNessieClient({
    apiKey: options.apiKey ?? 'mock-key',
    baseUrl: 'http://nessie.mock',
    fetchImpl: createMockFetch(options.store ?? sharedMockStore(), options),
    retryDelayMs: options.latencyMs ? 500 : 1,
    mode: 'mock',
  });
}
