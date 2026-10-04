// Generates the app's sound effects once with ElevenLabs Sound Effects and saves them under web/public/sfx.
// Usage (from web/): node ../scripts/generate-sfx.mjs [name ...]   (no names = all; existing files are skipped unless --force)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const envPath = join(here, '..', 'web', '.env.local');
const key = process.env.ELEVENLABS_API_KEY
  ?? readFileSync(envPath, 'utf8').split(/\r?\n/).find((l) => l.startsWith('ELEVENLABS_API_KEY='))?.split('=')[1]?.trim();
if (!key) { console.error('ELEVENLABS_API_KEY missing'); process.exit(1); }

const SOUNDS = {
  flake: { text: 'short sad trombone wah wah wah, cartoon failure sting, comedic', duration: 2.5 },
  success: { text: 'short cheerful victory fanfare with a sparkle chime, video game level complete', duration: 2 },
  cash: { text: 'cash register ka-ching with a few coins, short', duration: 1.5 },
  nudge: { text: 'gentle double bell ding ding, friendly reminder notification', duration: 1.5 },
};

const outDir = join(here, '..', 'web', 'public', 'sfx');
mkdirSync(outDir, { recursive: true });
const force = process.argv.includes('--force');
const wanted = process.argv.slice(2).filter((a) => !a.startsWith('--'));

for (const [name, s] of Object.entries(SOUNDS)) {
  if (wanted.length && !wanted.includes(name)) continue;
  const file = join(outDir, `${name}.mp3`);
  if (existsSync(file) && !force) { console.log(`skip ${name} (exists)`); continue; }
  const r = await fetch('https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_64', {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: s.text, duration_seconds: s.duration, prompt_influence: 0.5 }),
  });
  if (!r.ok) { console.error(`${name}: HTTP ${r.status}`); process.exitCode = 1; continue; }
  const buf = Buffer.from(await r.arrayBuffer());
  writeFileSync(file, buf);
  console.log(`${name}: ${buf.length} bytes`);
}
