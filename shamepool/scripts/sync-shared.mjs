// Copies the pure client modules the Spacetime module reuses into spacetimedb/src/shared.
// Run from anywhere: node scripts/sync-shared.mjs
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'spacetimedb', 'src', 'shared');
mkdirSync(out, { recursive: true });
const files = [
  ['web/src/data/types.ts', 'types.ts'],
  ['web/src/data/logic.ts', 'logic.ts'],
  ['web/src/data/authLogic.ts', 'authLogic.ts'],
  ['web/src/data/billingLogic.ts', 'billingLogic.ts'],
  ['web/src/data/live/mappers.ts', 'mappers.ts'],
  ['web/src/data/live/sha256.ts', 'sha256.ts'],
];
for (const [from, to] of files) {
  const src = readFileSync(join(root, from), 'utf8').replace(/from '\.\.\/types'/g, "from './types'");
  writeFileSync(join(out, to), `// GENERATED COPY of ${from}. Do not edit; run: node scripts/sync-shared.mjs\n${src}`);
}
void copyFileSync;
console.log(`synced ${files.length} files to ${out}`);
