// End-to-end through handleNessieJob. Run from web/: npx tsx ../scripts/nessie-e2e.ts   (NESSIE_MODE=mock for the twin)
import { loadEnv } from './_env';

loadEnv();
const short = (s: unknown) => String(s).slice(0, 8);

async function main() {
  const { getNessie, handleNessieJob } = await import('../web/src/server/nessie/index');
  const n = getNessie();
  const run = (kind: string, payload: Record<string, unknown>) => handleNessieJob({ id: 'e2e', kind, payload, attempts: 0 }, n);
  const tag = Date.now().toString(36);
  console.log(`mode=${n.mode} tag=${tag}`);

  const u1 = await run('nessie_create_user', { ik: `e2e:${tag}:u1`, userId: `e2e-${tag}-1`, name: 'Eve Alpha' });
  const u2 = await run('nessie_create_user', { ik: `e2e:${tag}:u2`, userId: `e2e-${tag}-2`, name: 'Eve Beta' });
  console.log('create_user x2 ->', short(u1.accountId), short(u2.accountId));
  const pool = await run('nessie_create_pool', { ik: `e2e:${tag}:pool`, squadId: `e2e-${tag}`, squadName: 'E2E Squad' });
  console.log('create_pool ->', short(pool.customerId), short(pool.accountId));

  const bal = async (label: string) => {
    const b = async (id: unknown) => (await n.getAccount(id as string)).balanceCents / 100;
    console.log(`balances ${label}: u1=$${await b(u1.accountId)} u2=$${await b(u2.accountId)} pool=$${await b(pool.accountId)}`);
  };
  await bal('start');

  const tp = { ik: `penalty:${tag}:1`, penaltyId: `e2e-${tag}-p1`, fromAccountId: u1.accountId, toAccountId: pool.accountId, amountCents: 1500 };
  const t1 = await run('nessie_transfer', tp);
  const t2 = await run('nessie_transfer', tp);
  const payer = await n.listTransfers(u1.accountId as string);
  const credits = await n.listDeposits(pool.accountId as string);
  console.log(`transfer x2 same ik -> ${short(t1.transferId)} / ${short(t2.transferId)} ; payer ledger entries=${payer.length} ; pool credit entries=${credits.length}`);
  if (t1.transferId !== t2.transferId || payer.length !== 1 || credits.length !== 1) throw new Error('IDEMPOTENCY FAILED');
  console.log('  ledger entry:', JSON.stringify({ ...payer[0], id: short(payer[0].id) }));

  const pu = { ik: `cashout:${tag}:1`, cashoutId: `e2e-${tag}-c1`, poolAccountId: pool.accountId, merchantName: 'Pizza House', amountCents: 1000 };
  const p1 = await run('nessie_purchase', pu);
  const p2 = await run('nessie_purchase', pu);
  const purchases = await n.listPurchases(pool.accountId as string);
  console.log(`purchase x2 -> merchant ${short(p1.merchantId)} purchase ${short(p1.purchaseId)} / ${short(p2.purchaseId)} ; entries=${purchases.length}`);
  if (p1.purchaseId !== p2.purchaseId || purchases.length !== 1) throw new Error('PURCHASE IDEMPOTENCY FAILED');

  const wd = { ik: `wd:${tag}:1`, withdrawalId: `e2e-${tag}-w1`, accountId: u2.accountId, amountCents: 2500 };
  const w1 = await run('nessie_withdraw', wd);
  const w2 = await run('nessie_withdraw', wd);
  const ws = await n.listWithdrawals(u2.accountId as string);
  console.log(`withdraw x2 -> ${short(w1.withdrawalId)} / ${short(w2.withdrawalId)} ; entries=${ws.length}`);
  if (w1.withdrawalId !== w2.withdrawalId || ws.length !== 1) throw new Error('WITHDRAW IDEMPOTENCY FAILED');

  await bal('end');
  console.log('OK');
}

main().catch((e) => {
  console.error('e2e failed:', e instanceof Error ? e.message : String(e));
  process.exit(1);
});
