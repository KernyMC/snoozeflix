import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

const req = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('http://localhost:3100/api/voice/speak', {
    method: 'POST', headers: { 'Content-Type': 'application/json', host: 'localhost:3100', origin: 'http://localhost:3100', ...headers }, body: JSON.stringify(body),
  });

describe('POST /api/voice/speak', () => {
  beforeEach(() => { process.env.ELEVENLABS_API_KEY = 'test-key'; });
  afterEach(() => { vi.unstubAllGlobals(); delete process.env.ELEVENLABS_API_KEY; });

  it('503 when the key is missing', async () => {
    delete process.env.ELEVENLABS_API_KEY;
    expect((await POST(req({ text: 'hi' }))).status).toBe(503);
  });
  it('400 for empty or unspeakable text', async () => {
    expect((await POST(req({ text: '🔥' }, { 'x-forwarded-for': '1.1.1.1' }))).status).toBe(400);
    expect((await POST(req({}, { 'x-forwarded-for': '1.1.1.1' }))).status).toBe(400);
  });
  it('403 for a foreign origin', async () => {
    expect((await POST(req({ text: 'hi' }, { origin: 'https://evil.example', 'x-forwarded-for': '2.2.2.2' }))).status).toBe(403);
  });
  it('returns audio, keeps the key out of the response and caches repeats', async () => {
    const fetchMock = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const a = await POST(req({ text: 'Kevin flaked on the gym' }, { 'x-forwarded-for': '3.3.3.3' }));
    expect(a.status).toBe(200);
    expect(a.headers.get('content-type')).toBe('audio/mpeg');
    expect((await a.arrayBuffer()).byteLength).toBe(3);
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((call[1].headers as Record<string, string>)['xi-api-key']).toBe('test-key');
    await POST(req({ text: 'Kevin flaked on the gym' }, { 'x-forwarded-for': '3.3.3.3' }));
    expect(fetchMock).toHaveBeenCalledTimes(1); // second hit served from cache
  });
  it('502 when ElevenLabs fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 401 })));
    expect((await POST(req({ text: 'a different line' }, { 'x-forwarded-for': '4.4.4.4' }))).status).toBe(502);
  });
  it('429 after too many requests from one ip', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([1]), { status: 200 })));
    let last = 200;
    for (let i = 0; i < 22; i++) last = (await POST(req({ text: `line number ${i}` }, { 'x-forwarded-for': '5.5.5.5' }))).status;
    expect(last).toBe(429);
  });
});
