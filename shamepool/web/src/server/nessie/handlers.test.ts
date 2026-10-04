import { describe, expect, it } from 'vitest';
import { handleNessieJob, type OutboxJob } from './handlers';
import { createMockNessie, createMockStore } from './mock';
import { NessieError } from './types';

const job = (kind: string, payload: Record<string, unknown>, attempts = 0): OutboxJob => ({ id: '1', kind, payload, attempts });

async function setup() {
  const n = createMockNessie({ store: createMockStore() });
  const user = await handleNessieJob(job('nessie_create_user', { ik: 'user:u1', userId: 'u1', name: 'Kevin Doe' }), n);
  const pool = await handleNessieJob(job('nessie_create_pool', { ik: 'pool:s1', squadId: 's1', squadName: 'Gym Bros' }), n);
  return { n, user, pool };
}

describe('handleNessieJob', () => {
  it('create_user / create_pool are idempotent and return ids', async () => {
    const { n, user, pool } = await setup();
    expect(user).toEqual({ customerId: expect.any(String), accountId: expect.any(String) });
    expect((await n.getAccount(user.accountId as string)).balanceCents).toBe(20000);
    expect((await n.getAccount(pool.accountId as string)).balanceCents).toBe(0);
    const again = await handleNessieJob(job('nessie_create_user', { ik: 'user:u1', userId: 'u1', name: 'Kevin Doe' }), n);
    expect(again).toEqual(user);
    expect(await n.listCustomers()).toHaveLength(2);
    const pool2 = await handleNessieJob(job('nessie_create_pool', { ik: 'pool:s1', squadId: 's1', squadName: 'Gym Bros' }), n);
    expect(pool2).toEqual(pool);
  });

  it('honors startingBalanceCents', async () => {
    const n = createMockNessie({ store: createMockStore() });
    const r = await handleNessieJob(job('nessie_create_user', { ik: 'user:u9', userId: 'u9', name: 'Solo', startingBalanceCents: 5000 }), n);
    expect((await n.getAccount(r.accountId as string)).balanceCents).toBe(5000);
  });

  it('nessie_transfer twice -> one transfer and one pool credit', async () => {
    const { n, user, pool } = await setup();
    const p = { ik: 'penalty:p1', penaltyId: 'p1', fromAccountId: user.accountId, toAccountId: pool.accountId, amountCents: 1500 };
    const r1 = await handleNessieJob(job('nessie_transfer', p), n);
    const r2 = await handleNessieJob(job('nessie_transfer', p, 1), n);
    expect(r1).toEqual({ transferId: expect.any(String) });
    expect(r2).toEqual(r1);
    expect(await n.listTransfers(user.accountId as string)).toHaveLength(1);
    expect(await n.listDeposits(pool.accountId as string)).toHaveLength(1);
    const t = (await n.listTransfers(user.accountId as string))[0];
    expect(t.amountDollars).toBe(15);
    expect(t.description).toContain(pool.accountId as string);
    expect(t.description).toContain('[ik:penalty:p1]');
  });

  it('nessie_withdraw twice -> one withdrawal', async () => {
    const { n, user } = await setup();
    const p = { ik: 'wd:w1', withdrawalId: 'w1', accountId: user.accountId, amountCents: 2500 };
    const r1 = await handleNessieJob(job('nessie_withdraw', p), n);
    const r2 = await handleNessieJob(job('nessie_withdraw', p), n);
    expect(r1).toEqual({ withdrawalId: expect.any(String) });
    expect(r2).toEqual(r1);
    expect(await n.listWithdrawals(user.accountId as string)).toHaveLength(1);
  });

  it('nessie_purchase twice -> one merchant, one purchase', async () => {
    const { n, pool } = await setup();
    const p = { ik: 'cashout:c1', cashoutId: 'c1', poolAccountId: pool.accountId, merchantName: 'Pizza House', amountCents: 3500 };
    const r1 = await handleNessieJob(job('nessie_purchase', p), n);
    const r2 = await handleNessieJob(job('nessie_purchase', p), n);
    expect(r1).toEqual({ merchantId: expect.any(String), purchaseId: expect.any(String) });
    expect(r2).toEqual(r1);
    expect(await n.listPurchases(pool.accountId as string)).toHaveLength(1);
    expect(await n.listMerchants()).toHaveLength(1);
  });

  it('sub-dollar and fractional-dollar penalties round per policy', async () => {
    const { n, user, pool } = await setup();
    const base = { fromAccountId: user.accountId, toAccountId: pool.accountId };
    await handleNessieJob(job('nessie_transfer', { ...base, ik: 'a', penaltyId: 'a', amountCents: 40 }), n);
    await handleNessieJob(job('nessie_transfer', { ...base, ik: 'b', penaltyId: 'b', amountCents: 250 }), n);
    const amounts = (await n.listTransfers(user.accountId as string)).map((t) => t.amountDollars).sort();
    expect(amounts).toEqual([1, 3]);
  });

  it('maps insufficient balance to a non-retryable 400 NessieError (balance-aware twin)', async () => {
    const n = createMockNessie({ store: createMockStore(), applyBalances: true });
    const user = await handleNessieJob(job('nessie_create_user', { ik: 'u', userId: 'u', name: 'Low', startingBalanceCents: 1000 }), n);
    const pool = await handleNessieJob(job('nessie_create_pool', { ik: 'p', squadId: 's', squadName: 'S' }), n);
    const err = await handleNessieJob(
      job('nessie_transfer', { ik: 'big', penaltyId: 'big', fromAccountId: user.accountId, toAccountId: pool.accountId, amountCents: 99900 }),
      n,
    ).catch((e) => e);
    expect(err).toBeInstanceOf(NessieError);
    expect(err.status).toBe(400);
    expect(err.retryable).toBe(false);
    expect(await n.listTransfers(user.accountId as string)).toHaveLength(0);
  });

  it('rejects bad payloads and unknown kinds without retry', async () => {
    const n = createMockNessie({ store: createMockStore() });
    const bad = await handleNessieJob(job('nessie_transfer', { ik: 'x', amountCents: -5 }), n).catch((e) => e);
    expect(bad).toBeInstanceOf(NessieError);
    expect(bad.code).toBe('bad_payload');
    expect(bad.retryable).toBe(false);
    const unk = await handleNessieJob(job('nessie_nope', {}), n).catch((e) => e);
    expect(unk.code).toBe('unknown_kind');
  });
});
