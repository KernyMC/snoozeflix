import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = path.resolve(__dirname, '..', '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|jsx?|mjs)$/.test(name)) out.push(p);
  }
  return out;
}

describe('Nessie key isolation', () => {
  it('no client-reachable source imports server/nessie or mentions NESSIE_API_KEY', () => {
    // src/app/api/** are server route handlers and may import the server modules; everything else under
    // src/app, src/components and src/data is (or may be bundled as) client code.
    const files = ['app', 'components', 'data']
      .flatMap((d) => walk(path.join(SRC, d)))
      .filter((f) => !f.split(path.sep).join('/').includes('/app/api/'));
    const offenders = files.filter((f) => {
      const t = readFileSync(f, 'utf8');
      return /server\/nessie/.test(t) || /NESSIE_API_KEY/.test(t);
    });
    expect(offenders).toEqual([]);
  });
});
