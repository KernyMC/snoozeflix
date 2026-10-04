// Generates one narration clip per scene with ElevenLabs, measures them, and writes src/timeline.json.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const FPS = 30;
const PAD_S = 0.55; // breathing room after each scene's narration
const script = JSON.parse(readFileSync('script.json', 'utf8'));
const env = readFileSync('E:/USERS/KEVIN/MLHACKS/flaketax/web/.env.local', 'utf8');
const key = env.split(/\r?\n/).find((l) => l.startsWith('ELEVENLABS_API_KEY=')).split('=')[1].trim();
mkdirSync('public/audio', { recursive: true });
const force = process.argv.includes('--force');
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));

async function tts(text, out) {
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${script.voice.id}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text, model_id: script.voice.model,
      voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.3, use_speaker_boost: true, speed: 1.0 },
    }),
  });
  if (!r.ok) throw new Error(`TTS ${r.status} ${(await r.text()).slice(0, 120)}`);
  writeFileSync(out, Buffer.from(await r.arrayBuffer()));
}
const duration = (f) => parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString());

const timeline = [];
let total = 0;
for (const s of script.scenes) {
  const file = `public/audio/${s.id}.mp3`;
  if ((force || !existsSync(file)) && (only.length === 0 || only.includes(s.id))) {
    process.stdout.write(`TTS ${s.id}... `);
    await tts(s.vo, file);
  }
  const d = duration(file);
  const frames = Math.round((d + PAD_S) * FPS);
  total += frames;
  timeline.push({ ...s, audio: `audio/${s.id}.mp3`, audioSeconds: +d.toFixed(2), frames });
  console.log(`${s.id}: ${d.toFixed(2)}s (${s.vo.split(' ').length} words)`);
}
writeFileSync('src/timeline.json', JSON.stringify({ fps: FPS, totalFrames: total, scenes: timeline }, null, 2));
console.log(`TOTAL ${(total / FPS).toFixed(1)}s  (${Math.floor(total / FPS / 60)}:${String(Math.round((total / FPS) % 60)).padStart(2, '0')})`);
