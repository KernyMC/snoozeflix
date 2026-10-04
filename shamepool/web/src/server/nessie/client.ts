// SERVER ONLY (see types.ts). Typed Nessie sandbox client: timeouts, retry, redaction,
// idempotency via "[ik:...]" tokens in the description. Behavior documented in docs/nessie-contract.md
// and verified against the real sandbox (docs/nessie-probe-output.json).
import {
  NessieError,
  type AccountInfo,
  type LedgerEntry,
  type NessieClient,
  type TransferResult,
} from './types';

export const NESSIE_BASE_URL = 'https://api.nessieisreal.com';

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface ClientOptions {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  retryDelayMs?: number;
  mode?: 'live' | 'mock';
}

/* ---------- money boundary ---------- */

/**
 * Sandbox amounts are whole dollars (decimals are silently truncated by the server). Policy:
 * cents -> dollars rounded half up; any positive amount below one dollar becomes 1 so a penalty never
 * silently turns into a zero transfer. Zero/negative/non-integer cents are rejected (the sandbox itself
 * accepts zero and negative amounts, we do not).
 */
export function centsToNessieAmount(cents: number, opts: { allowZero?: boolean } = {}): number {
  if (!Number.isInteger(cents) || cents < 0 || (cents === 0 && !opts.allowZero)) {
    throw new NessieError({ status: 400, code: 'bad_amount', message: `amountCents must be a positive integer, got ${cents}` });
  }
  if (cents === 0) return 0;
  return Math.max(1, Math.round(cents / 100));
}

export function nessieAmountToCents(dollars: number): number {
  return Math.round(dollars * 100);
}

/* ---------- idempotency + redaction ---------- */

const IK_RE = /^[A-Za-z0-9:_.\-]{1,120}$/;

export function ikToken(ik: string): string {
  if (!IK_RE.test(ik)) {
    throw new NessieError({ status: 400, code: 'bad_ik', message: 'idempotency key must match [A-Za-z0-9:_.-]{1,120}' });
  }
  return `[ik:${ik}]`;
}

export function withIk(description: string, ik: string): string {
  return `${description.replace(/\s*\[ik:[^\]]*\]/g, '').trim()} ${ikToken(ik)}`.trim();
}

/** Remove the API key (literal value and any `key=...` query fragment) from a string. */
export function redact(text: string, apiKey?: string): string {
  let out = text.replace(/([?&]key=)[^&\s"']*/gi, '$1[REDACTED]');
  if (apiKey) out = out.split(apiKey).join('[REDACTED]');
  return out;
}

/* ---------- helpers ---------- */

const DEMO_ADDRESS = { street_number: '500', street_name: 'S State St', city: 'Ann Arbor', state: 'MI', zip: '48109' };
const MERCHANT_ADDRESS = { street_number: '1', street_name: 'Main St', city: 'Ann Arbor', state: 'MI', zip: '48104' };
const MERCHANT_GEO = { lat: 42.2808, lng: -83.743 };

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const today = () => new Date().toISOString().slice(0, 10);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/* ---------- client ---------- */

export function createNessieClient(opts: ClientOptions): NessieClient {
  const apiKey = opts.apiKey;
  const baseUrl = (opts.baseUrl ?? NESSIE_BASE_URL).replace(/\/+$/, '');
  const doFetch: FetchLike = opts.fetchImpl ?? ((u, i) => fetch(u, i));
  const timeoutMs = opts.timeoutMs ?? 8000;
  const retryDelayMs = opts.retryDelayMs ?? 500;
  if (!apiKey) throw new NessieError({ status: 0, code: 'no_key', message: 'NESSIE_API_KEY is not set', retryable: false });

  async function once(method: string, path: string, body?: unknown): Promise<{ status: number; data: Json }> {
    const url = `${baseUrl}${path}${path.includes('?') ? '&' : '?'}key=${encodeURIComponent(apiKey)}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await doFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: ctrl.signal,
      });
      const text = await res.text();
      let data: Json = text;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        /* plain text error body (the sandbox returns validation errors as a bare JSON string or text) */
      }
      return { status: res.status, data };
    } catch (e) {
      const aborted = (e as Error)?.name === 'AbortError';
      throw new NessieError({
        status: 0,
        code: aborted ? 'timeout' : 'network',
        message: redact(aborted ? `Nessie request timed out after ${timeoutMs}ms (${method} ${path})` : `Nessie network error: ${(e as Error)?.message ?? e}`, apiKey),
        retryable: true,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  function toError(status: number, data: Json, method: string, path: string): NessieError {
    let message = '';
    const culprit: string[] = [];
    if (typeof data === 'string') {
      message = data.trim();
      for (const m of message.matchAll(/^([A-Za-z_][\w.]*)\s*$/gm)) culprit.push(m[1]);
    } else if (data && typeof data === 'object') {
      message = str(data.message) || JSON.stringify(data);
      if (Array.isArray(data.culprit)) culprit.push(...data.culprit.map(String));
    }
    if (!message) message = status === 404 ? 'Not found' : `HTTP ${status}`;
    const isValidation = /validation error/i.test(message);
    return new NessieError({
      status,
      code: isValidation ? 'validation' : status === 404 ? 'not_found' : status === 403 ? 'forbidden' : `http_${status}`,
      message: redact(`${method} ${path.split('?')[0]} -> ${status}: ${message.replace(/\s*\n\s*/g, ' | ').slice(0, 400)}`, apiKey),
      culprit,
    });
  }

  /** GET/DELETE/PUT with one retry on network error / 5xx. */
  async function call(method: string, path: string, body?: unknown, opts2: { retry?: boolean } = {}): Promise<Json> {
    const attempts = opts2.retry === false ? 1 : 2;
    let last: NessieError | undefined;
    for (let i = 0; i < attempts; i++) {
      if (i > 0) await sleep(retryDelayMs);
      try {
        const { status, data } = await once(method, path, body);
        if (status >= 200 && status < 300) return data;
        const err = toError(status, data, method, path);
        if (status >= 500 && i < attempts - 1) {
          last = err;
          continue;
        }
        throw err;
      } catch (e) {
        if (e instanceof NessieError && e.retryable && i < attempts - 1) {
          last = e;
          continue;
        }
        throw e;
      }
    }
    throw last ?? new NessieError({ status: 0, message: 'unreachable' });
  }

  const post = (path: string, body: unknown) => call('POST', path, body, { retry: false });

  function createdId(data: Json, what: string): string {
    const id = data?.objectCreated?._id ?? data?.objectCreated?.id;
    if (typeof id !== 'string' || !id) {
      throw new NessieError({ status: 502, code: 'bad_response', message: `Nessie ${what} response had no objectCreated._id`, retryable: true });
    }
    return id;
  }

  async function listLedger(accountId: string, kind: 'transfers' | 'purchases' | 'withdrawals' | 'deposits'): Promise<LedgerEntry[]> {
    let data: Json;
    try {
      data = await call('GET', `/accounts/${encodeURIComponent(accountId)}/${kind}`);
    } catch (e) {
      if (e instanceof NessieError && e.status === 404) return []; // sandbox: 404 "No transfers found for this account"
      throw e;
    }
    if (!Array.isArray(data)) return [];
    return data.map((r: Json) => ({
      id: str(r._id) || str(r.id),
      amountDollars: Number(r.amount ?? 0),
      status: str(r.status),
      description: str(r.description),
      date: str(r.transaction_date) || str(r.purchase_date) || str(r.creation_date),
    }));
  }

  /**
   * Find-then-create under an idempotency key. The sandbox has no idempotency support, so the key lives in the
   * description. A POST is never blindly retried: after a retryable failure we re-check the ledger first, because the
   * request may have been applied before the connection died.
   */
  async function idempotent<T>(
    find: () => Promise<LedgerEntry | undefined>,
    create: () => Promise<T>,
    fromEntry: (e: LedgerEntry) => T,
  ): Promise<T & { created: boolean }> {
    const existing = await find();
    if (existing) return { ...fromEntry(existing), created: false };
    try {
      return { ...(await create()), created: true };
    } catch (e) {
      if (!(e instanceof NessieError) || !e.retryable) throw e;
      await sleep(retryDelayMs);
      const raced = await find();
      if (raced) return { ...fromEntry(raced), created: false };
      return { ...(await create()), created: true };
    }
  }

  const findByIk = (entries: LedgerEntry[], ik: string) => {
    const token = ikToken(ik);
    return entries.find((e) => e.description.includes(token));
  };

  function accountFrom(r: Json): AccountInfo {
    return {
      accountId: str(r._id),
      customerId: str(r.customer_id),
      nickname: str(r.nickname),
      type: str(r.type),
      balanceCents: nessieAmountToCents(Number(r.balance ?? 0)),
    };
  }

  const client: NessieClient = {
    mode: opts.mode ?? 'live',

    async createCustomer({ firstName, lastName, streetName }) {
      const data = await post('/customers', {
        first_name: firstName,
        last_name: lastName,
        address: { ...DEMO_ADDRESS, street_name: streetName ?? DEMO_ADDRESS.street_name },
      });
      return { customerId: createdId(data, 'customer') };
    },

    async listCustomers() {
      const data = await call('GET', '/customers');
      return (Array.isArray(data) ? data : []).map((c: Json) => ({
        customerId: str(c._id),
        firstName: str(c.first_name),
        lastName: str(c.last_name),
        streetName: str(c.address?.street_name),
      }));
    },

    async createAccount(customerId, { nickname, type = 'Checking', startingBalanceCents = 0 }) {
      const data = await post(`/customers/${encodeURIComponent(customerId)}/accounts`, {
        type,
        nickname,
        rewards: 0,
        balance: centsToNessieAmount(startingBalanceCents, { allowZero: true }),
      });
      return { accountId: createdId(data, 'account') };
    },

    async listAccounts(customerId) {
      const data = await call('GET', `/customers/${encodeURIComponent(customerId)}/accounts`);
      return (Array.isArray(data) ? data : []).map(accountFrom);
    },

    async getAccount(accountId) {
      return accountFrom(await call('GET', `/accounts/${encodeURIComponent(accountId)}`));
    },

    async deleteAccount(accountId) {
      await call('DELETE', `/accounts/${encodeURIComponent(accountId)}`);
    },

    async createMerchant({ name, category = 'food' }) {
      const data = await post('/merchants', { name, category, address: MERCHANT_ADDRESS, geocode: MERCHANT_GEO });
      return { merchantId: createdId(data, 'merchant') };
    },

    async listMerchants() {
      const data = await call('GET', '/merchants');
      return (Array.isArray(data) ? data : []).map((m: Json) => ({ merchantId: str(m._id), name: str(m.name) }));
    },

    async ensureMerchant({ name, category }) {
      const found = (await client.listMerchants()).find((m) => m.name === name);
      if (found) return { merchantId: found.merchantId };
      return client.createMerchant({ name, category });
    },

    async transfer({ fromAccountId, toAccountId, amountCents, description, idempotencyKey }) {
      const amount = centsToNessieAmount(amountCents);
      // The sandbox transfer has no payee field, so the destination is recorded in the description.
      const desc = withIk(`${description} -> ${toAccountId}`, idempotencyKey);
      const r = await idempotent<Omit<TransferResult, 'created'>>(
        async () => findByIk(await client.listTransfers(fromAccountId), idempotencyKey),
        async () => {
          const data = await post(`/accounts/${encodeURIComponent(fromAccountId)}/transfers`, {
            transaction_date: today(),
            status: 'completed',
            amount,
            description: desc,
          });
          return { transferId: createdId(data, 'transfer'), status: str(data?.objectCreated?.status) || 'completed' };
        },
        (e) => ({ transferId: e.id, status: e.status }),
      );
      return r;
    },

    listTransfers: (id) => listLedger(id, 'transfers'),

    async purchase({ accountId, merchantId, amountCents, description, idempotencyKey }) {
      const amount = centsToNessieAmount(amountCents);
      const desc = withIk(description, idempotencyKey);
      const r = await idempotent(
        async () => findByIk(await client.listPurchases(accountId), idempotencyKey),
        async () => {
          const data = await post(`/accounts/${encodeURIComponent(accountId)}/purchases`, {
            merchant_id: merchantId,
            medium: 'balance',
            purchase_date: today(),
            status: 'completed',
            amount,
            description: desc,
          });
          return { purchaseId: createdId(data, 'purchase'), status: str(data?.objectCreated?.status) || 'completed' };
        },
        (e) => ({ purchaseId: e.id, status: e.status }),
      );
      return r;
    },

    listPurchases: (id) => listLedger(id, 'purchases'),

    async withdraw({ accountId, amountCents, description, idempotencyKey }) {
      const amount = centsToNessieAmount(amountCents);
      const desc = withIk(description, idempotencyKey);
      return idempotent(
        async () => findByIk(await client.listWithdrawals(accountId), idempotencyKey),
        async () => {
          const data = await post(`/accounts/${encodeURIComponent(accountId)}/withdrawals`, {
            medium: 'balance',
            transaction_date: today(),
            status: 'completed',
            amount,
            description: desc,
          });
          return { withdrawalId: createdId(data, 'withdrawal'), status: str(data?.objectCreated?.status) || 'completed' };
        },
        (e) => ({ withdrawalId: e.id, status: e.status }),
      );
    },

    listWithdrawals: (id) => listLedger(id, 'withdrawals'),

    async deposit({ accountId, amountCents, description, idempotencyKey }) {
      const amount = centsToNessieAmount(amountCents);
      const desc = withIk(description, idempotencyKey);
      return idempotent(
        async () => findByIk(await client.listDeposits(accountId), idempotencyKey),
        async () => {
          const data = await post(`/accounts/${encodeURIComponent(accountId)}/deposits`, {
            medium: 'balance',
            transaction_date: today(),
            status: 'completed',
            amount,
            description: desc,
          });
          return { depositId: createdId(data, 'deposit'), status: str(data?.objectCreated?.status) || 'completed' };
        },
        (e) => ({ depositId: e.id, status: e.status }),
      );
    },

    listDeposits: (id) => listLedger(id, 'deposits'),
  };
  return client;
}
