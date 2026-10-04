import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

function req(parts: Record<string, Blob | string>, headers: Record<string, string> = {}) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(parts)) { if (typeof v === 'string') fd.append(k, v); else fd.append(k, v, 'speech.webm'); }
  return new Request('http://localhost:3100/api/voice/transcribe', { method: 'POST', headers: { host: 'localhost:3100', origin: 'http://localhost:3100', ...headers }, body: fd });
}
const audio = (n = 100) => new Blob([new Uint8Array(n)], { type: 'audio/webm' });

describe('POST /api/voice/transcribe', () => {
  beforeEach(() => { process.env.ELEVENLABS_API_KEY = 'test-key'; });
  afterEach(() => { vi.unstubAllGlobals(); delete process.env.ELEVENLABS_API_KEY; });

  it('503 without the key', async () => {
    delete process.env.ELEVENLABS_API_KEY;
    expect((await POST(req({ audio: audio() }))).status).toBe(503);
  });
  it('403 for a foreign origin, 400 without audio, 413 when too large, 415 for non-audio', async () => {
    expect((await POST(req({ audio: audio() }, { origin: 'https://evil.example', 'x-forwarded-for': '9.9.9.1' }))).status).toBe(403);
    expect((await POST(req({}, { 'x-forwarded-for': '9.9.9.2' }))).status).toBe(400);
    expect((await POST(req({ audio: audio(3 * 1024 * 1024) }, { 'x-forwarded-for': '9.9.9.3' }))).status).toBe(413);
    const pdf = new Blob([new Uint8Array(10)], { type: 'application/pdf' });
    expect((await POST(req({ audio: pdf }, { 'x-forwarded-for': '9.9.9.4' }))).status).toBe(415);
  });
  it('returns the cleaned transcript and sends the key only upstream', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ text: '  Who is   flaking? ' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const res = await POST(req({ audio: audio() }, { 'x-forwarded-for': '9.9.9.5' }));
    expect(await res.json()).toEqual({ text: 'Who is flaking?' });
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((call[1].headers as Record<string, string>)['xi-api-key']).toBe('test-key');
  });
  it('422 when nothing was said and 502 when upstream fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ text: '   ' }), { status: 200 })));
    expect((await POST(req({ audio: audio() }, { 'x-forwarded-for': '9.9.9.6' }))).status).toBe(422);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x', { status: 401 })));
    expect((await POST(req({ audio: audio() }, { 'x-forwarded-for': '9.9.9.7' }))).status).toBe(502);
  });
  it('429 after 15 requests from one ip', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ text: 'hi' }), { status: 200 })));
    let last = 200;
    for (let i = 0; i < 17; i++) last = (await POST(req({ audio: audio() }, { 'x-forwarded-for': '9.9.9.8' }))).status;
    expect(last).toBe(429);
  });
});
