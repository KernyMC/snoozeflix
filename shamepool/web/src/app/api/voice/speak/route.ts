import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { sanitizeSpeech } from '@/lib/speech';
import { guardRequest } from '@/lib/server/limits';

// Server-only: the ElevenLabs key never reaches the browser.
export const runtime = 'nodejs';

const DEFAULT_VOICE = 'EXAVITQu4vr4xnSDxMaL';
const MODEL = 'eleven_flash_v2_5';
const CACHE_MAX = 60;
const RATE_PER_MIN = 20;
const GLOBAL_PER_HOUR = 250;

const cache = new Map<string, ArrayBuffer>();
export async function POST(req: Request) {
  const blocked = guardRequest(req, 'tts', RATE_PER_MIN, GLOBAL_PER_HOUR);
  if (blocked) return blocked;
  const key = process.env.ELEVENLABS_API_KEY?.trim();
  if (!key) return NextResponse.json({ error: 'voice_unavailable' }, { status: 503 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_body' }, { status: 400 }); }
  const text = sanitizeSpeech((body as { text?: unknown } | null)?.text);
  if (!text) return NextResponse.json({ error: 'empty_text' }, { status: 400 });

  const voice = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE;
  const ck = createHash('sha1').update(`${voice}:${text}`).digest('hex');
  let audio = cache.get(ck);

  if (!audio) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12_000);
    try {
      const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_64`, {
        method: 'POST',
        headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
        body: JSON.stringify({ text, model_id: MODEL, voice_settings: { stability: 0.4, similarity_boost: 0.75, style: 0.35 } }),
        signal: ctrl.signal,
      });
      if (!r.ok) return NextResponse.json({ error: 'voice_failed', status: r.status }, { status: 502 });
      audio = await r.arrayBuffer();
    } catch {
      return NextResponse.json({ error: 'voice_failed' }, { status: 502 });
    } finally {
      clearTimeout(timer);
    }
    cache.set(ck, audio);
    if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
  }

  return new Response(audio, { headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'private, max-age=3600' } });
}
