import { NextResponse } from 'next/server';
import { clientIp, foreignOrigin, tooMany } from '@/lib/server/limits';

// Server-only: speech-to-text with ElevenLabs Scribe. The key never reaches the browser.
export const runtime = 'nodejs';

const MAX_BYTES = 2 * 1024 * 1024; // ~ 1 minute of opus audio is far below this

export async function POST(req: Request) {
  const key = process.env.ELEVENLABS_API_KEY?.trim();
  if (!key) return NextResponse.json({ error: 'voice_unavailable' }, { status: 503 });
  if (foreignOrigin(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (tooMany('stt', clientIp(req), 15, 300)) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });

  let audio: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get('audio');
    audio = f instanceof File ? f : null;
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  if (!audio || audio.size === 0) return NextResponse.json({ error: 'no_audio' }, { status: 400 });
  if (audio.size > MAX_BYTES) return NextResponse.json({ error: 'too_large' }, { status: 413 });
  if (audio.type && !/^(audio|video)\//.test(audio.type)) return NextResponse.json({ error: 'invalid_audio' }, { status: 415 });

  const fd = new FormData();
  fd.append('model_id', 'scribe_v1');
  fd.append('tag_audio_events', 'false');
  fd.append('file', audio, audio.name || 'speech.webm');

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const r = await fetch('https://api.elevenlabs.io/v1/speech-to-text', { method: 'POST', headers: { 'xi-api-key': key }, body: fd, signal: ctrl.signal });
    if (!r.ok) return NextResponse.json({ error: 'transcribe_failed', status: r.status }, { status: 502 });
    const data = (await r.json()) as { text?: string };
    const text = (data.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 280);
    if (!text) return NextResponse.json({ error: 'no_speech' }, { status: 422 });
    return NextResponse.json({ text });
  } catch {
    return NextResponse.json({ error: 'transcribe_failed' }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}
