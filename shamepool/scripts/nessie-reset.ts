// Deletes every account whose nickname starts with "FT-" (seed + app-created accounts) in the sandbox.
// Customers and merchants cannot be deleted in the sandbox (403) and are left in place; re-seeding reuses them.
// Run from web/: npx tsx ../scripts/nessie-reset.ts
import { loadEnv } from './_env';

loadEnv();

async function main() {
  const { getNessie } = await import('../web/src/server/nessie/index');
  const n = getNessie();
  let deleted = 0;
  for (const c of await n.listCustomers()) {
    for (const a of await n.listAccounts(c.customerId)) {
      if (a.nickname.startsWith('FT-')) {
        await n.deleteAccount(a.accountId);
        deleted += 1;
      }
    }
  }
  console.log(`deleted ${deleted} FT-* account(s) (mode ${n.mode})`);
}

main().catch((e) => {
  console.error('reset failed:', e instanceof Error ? e.message : String(e));
  process.exit(1);
});
