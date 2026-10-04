// SERVER ONLY (see types.ts). Outbox job handlers for the Spacetime -> Nessie bridge.
// Contract: docs/backend-contract.md. Every handler is idempotent: running a job twice yields one Nessie
// transfer / purchase / withdrawal / customer / account, because every write is keyed by `ik`.
import { z } from 'zod';
import { getNessie } from './select';
import { NessieError, type NessieClient } from './types';

export interface OutboxJob {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  attempts: number;
}

const ik = z.string().min(1).max(100);
const cents = z.number().int().positive();

const schemas = {
  nessie_create_user: z.object({
    ik,
    userId: z.string().min(1),
    name: z.string().min(1),
    startingBalanceCents: z.number().int().min(0).optional(),
  }),
  nessie_create_pool: z.object({ ik, squadId: z.string().min(1), squadName: z.string().min(1) }),
  nessie_transfer: z.object({
    ik,
    penaltyId: z.string().min(1),
    fromAccountId: z.string().min(1),
    toAccountId: z.string().min(1),
    amountCents: cents,
  }),
  nessie_withdraw: z.object({ ik, withdrawalId: z.string().min(1), accountId: z.string().min(1), amountCents: cents }),
  nessie_purchase: z.object({
    ik,
    cashoutId: z.string().min(1),
    poolAccountId: z.string().min(1),
    merchantName: z.string().min(1),
    amountCents: cents,
  }),
} as const;

const DEFAULT_STARTING_CENTS = 20000;
/** The customer record has no free-text field, so its street_name carries the idempotency key. */
const customerMarker = (key: string) => `ShamePool ik:${key}`;

function parse<K extends keyof typeof schemas>(kind: K, payload: unknown): z.infer<(typeof schemas)[K]> {
  const r = schemas[kind].safeParse(payload);
  if (!r.success) {
    throw new NessieError({
      status: 400,
      code: 'bad_payload',
      message: `${kind}: invalid payload (${r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')})`,
      retryable: false,
    });
  }
  return r.data as z.infer<(typeof schemas)[K]>;
}

async function ensureCustomer(n: NessieClient, key: string, firstName: string, lastName: string): Promise<string> {
  const marker = customerMarker(key);
  const found = (await n.listCustomers()).find((c) => c.streetName === marker);
  if (found) return found.customerId;
  return (await n.createCustomer({ firstName, lastName, streetName: marker })).customerId;
}

async function ensureAccount(n: NessieClient, customerId: string, nickname: string, startingBalanceCents: number): Promise<string> {
  const found = (await n.listAccounts(customerId)).find((a) => a.nickname === nickname);
  if (found) return found.accountId;
  return (await n.createAccount(customerId, { nickname, type: 'Checking', startingBalanceCents })).accountId;
}

export async function handleNessieJob(job: OutboxJob, client?: NessieClient): Promise<Record<string, unknown>> {
  const n = client ?? getNessie();
  switch (job.kind) {
    case 'nessie_create_user': {
      const p = parse('nessie_create_user', job.payload);
      const [first, ...rest] = p.name.trim().split(/\s+/);
      const customerId = await ensureCustomer(n, p.ik, first, rest.join(' ') || 'ShamePool');
      const accountId = await ensureAccount(n, customerId, `FT-user-${p.userId}`, p.startingBalanceCents ?? DEFAULT_STARTING_CENTS);
      return { customerId, accountId };
    }
    case 'nessie_create_pool': {
      const p = parse('nessie_create_pool', job.payload);
      const customerId = await ensureCustomer(n, p.ik, 'ShamePool', p.squadName);
      const accountId = await ensureAccount(n, customerId, `FT-pool-${p.squadId}`, 0);
      return { customerId, accountId };
    }
    case 'nessie_transfer': {
      const p = parse('nessie_transfer', job.payload);
      const t = await n.transfer({
        fromAccountId: p.fromAccountId,
        toAccountId: p.toAccountId,
        amountCents: p.amountCents,
        description: `ShamePool penalty ${p.penaltyId}`,
        idempotencyKey: p.ik,
      });
      // The sandbox transfer records no payee, so mirror it as a deposit on the pool account (payee-side ledger).
      await n.deposit({
        accountId: p.toAccountId,
        amountCents: p.amountCents,
        description: `ShamePool penalty credit ${p.penaltyId} from ${p.fromAccountId}`,
        idempotencyKey: `${p.ik}:in`,
      });
      // poolBalanceCents deliberately omitted: sandbox balances never move (docs/nessie-contract.md).
      return { transferId: t.transferId };
    }
    case 'nessie_withdraw': {
      const p = parse('nessie_withdraw', job.payload);
      const w = await n.withdraw({
        accountId: p.accountId,
        amountCents: p.amountCents,
        description: `ShamePool withdrawal ${p.withdrawalId}`,
        idempotencyKey: p.ik,
      });
      return { withdrawalId: w.withdrawalId };
    }
    case 'nessie_purchase': {
      const p = parse('nessie_purchase', job.payload);
      const { merchantId } = await n.ensureMerchant({ name: p.merchantName, category: 'food' });
      const pu = await n.purchase({
        accountId: p.poolAccountId,
        merchantId,
        amountCents: p.amountCents,
        description: `ShamePool cash-out ${p.cashoutId} at ${p.merchantName}`,
        idempotencyKey: p.ik,
      });
      return { merchantId, purchaseId: pu.purchaseId };
    }
    default:
      throw new NessieError({ status: 400, code: 'unknown_kind', message: `Unknown Nessie job kind: ${job.kind}`, retryable: false });
  }
}
