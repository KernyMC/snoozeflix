// Demo seed for the Nessie sandbox. Run from web/: npx tsx ../scripts/nessie-seed.ts
// Idempotent (all writes keyed by ik "seed:*"). Prints KEY=value lines.
import { loadEnv } from './_env';

loadEnv();

async function main() {
  const { getNessie, handleNessieJob } = await import('../web/src/server/nessie/index');
  const n = getNessie();
  const run = (kind: string, payload: Record<string, unknown>) => handleNessieJob({ id: 'seed', kind, payload, attempts: 0 }, n);
  const out: string[] = [`NESSIE_MODE_USED=${n.mode}`];

  const pool = await run('nessie_create_pool', { ik: 'seed:pool', squadId: 'demo', squadName: 'Demo Squad' });
  out.push(`SEED_POOL_CUSTOMER_ID=${pool.customerId}`, `SEED_POOL_ACCOUNT_ID=${pool.accountId}`);

  const users: Record<string, string> = {};
  for (const name of ['Kevin', 'Ana', 'Leo', 'Maya']) {
    const key = name.toLowerCase();
    const u = await run('nessie_create_user', { ik: `seed:user:${key}`, userId: `seed-${key}`, name, startingBalanceCents: 20000 });
    users[key] = u.accountId as string;
    out.push(`SEED_${name.toUpperCase()}_CUSTOMER_ID=${u.customerId}`, `SEED_${name.toUpperCase()}_ACCOUNT_ID=${u.accountId}`);
  }

  const merchant = await n.ensureMerchant({ name: 'Pizza House', category: 'food' });
  out.push(`SEED_MERCHANT_PIZZA_HOUSE_ID=${merchant.merchantId}`);

  // Two historical penalties so the pool starts at about $35.
  const hist = [
    { who: 'kevin', cents: 2000 },
    { who: 'ana', cents: 1500 },
  ];
  for (const h of hist) {
    const t = await run('nessie_transfer', {
      ik: `seed:penalty:${h.who}`,
      penaltyId: `seed-${h.who}`,
      fromAccountId: users[h.who],
      toAccountId: pool.accountId,
      amountCents: h.cents,
    });
    out.push(`SEED_PENALTY_${h.who.toUpperCase()}_TRANSFER_ID=${t.transferId}`);
  }
  console.log(out.join('\n'));
}

main().catch((e) => {
  console.error('seed failed:', e instanceof Error ? e.message : String(e));
  process.exit(1);
});
