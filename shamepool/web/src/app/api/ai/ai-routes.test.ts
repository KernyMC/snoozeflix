import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as chat } from './chat/route';
import { POST as coach } from './coach/route';
import { POST as verify } from './verify-photo/route';

let n = 0;
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`http://localhost:3100/api/ai/${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', host: 'localhost:3100', 'x-forwarded-for': `10.0.0.${++n}`, ...headers }, body: JSON.stringify(body),
  });
const xai = (message: unknown) => vi.fn(async () => new Response(JSON.stringify({ choices: [{ message }] }), { status: 200 }));
const b64 = 'A'.repeat(400);

beforeEach(() => { process.env.XAI_API_KEY = 'test-key'; });
afterEach(() => { vi.unstubAllGlobals(); delete process.env.XAI_API_KEY; });

describe('POST /api/ai/chat', () => {
  const ok = { message: 'who is flaking?', history: [{ from: 'me', text: 'hi' }], context: { squad: { pool: '$35' } } };
  it('503 without a key, 400 on bad input, 403 for a foreign origin', async () => {
    delete process.env.XAI_API_KEY;
    expect((await chat(post('chat', ok))).status).toBe(503);
    process.env.XAI_API_KEY = 'test-key';
    expect((await chat(post('chat', { ...ok, message: '  ' }))).status).toBe(400);
    expect((await chat(post('chat', { ...ok, context: null }))).status).toBe(400);
    expect((await chat(post('chat', ok, { origin: 'https://evil.example' }))).status).toBe(403);
  });
  it('returns the reply and keeps data and key in the right places', async () => {
    const f = xai({ content: 'Kevin, obviously.' });
    vi.stubGlobal('fetch', f);
    const res = await chat(post('chat', ok));
    expect(await res.json()).toEqual({ text: 'Kevin, obviously.', action: null });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.x.ai/v1/chat/completions');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-key');
    const sent = JSON.parse(String(init.body));
    expect(JSON.stringify(sent.messages)).toContain('$35');
    expect(sent.tools[0].function.name).toBe('propose_penalty_change');
  });
  it('maps a penalty tool call to an action', async () => {
    vi.stubGlobal('fetch', xai({ content: '', tool_calls: [{ function: { name: 'propose_penalty_change', arguments: '{"goal_title":"Gym","dollars":10}' } }] }));
    const j = await (await chat(post('chat', { ...ok, message: 'set my gym penalty to 10' }))).json();
    expect(j.action).toEqual({ goalTitle: 'Gym', dollars: 10 });
  });
  it('502 when the provider fails or answers nothing; 429 is passed through', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x', { status: 500 })));
    expect((await chat(post('chat', ok))).status).toBe(502);
    vi.stubGlobal('fetch', xai({ content: '' }));
    expect((await chat(post('chat', ok))).status).toBe(502);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x', { status: 429 })));
    expect((await chat(post('chat', ok))).status).toBe(429);
  });
  it('drops a penalty action nobody asked for and answers again without tools', async () => {
    const calls: Array<{ tools?: unknown }> = [];
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: RequestInit) => {
      const sent = JSON.parse(String(init.body));
      calls.push(sent);
      const message = sent.tools
        ? { content: '', tool_calls: [{ function: { name: 'propose_penalty_change', arguments: '{"goal_title":"Gym","dollars":5}' } }] }
        : { content: 'Ana is winning, obviously.' };
      return new Response(JSON.stringify({ choices: [{ message }] }), { status: 200 });
    }));
    const j = await (await chat(post('chat', { ...ok, message: 'quien va ganando?' }))).json();
    expect(j).toEqual({ text: 'Ana is winning, obviously.', action: null });
    expect(calls).toHaveLength(2);
    expect(calls[1].tools).toBeUndefined();
  });
  it('keeps the action when the user really asked for it', async () => {
    vi.stubGlobal('fetch', xai({ content: '', tool_calls: [{ function: { name: 'propose_penalty_change', arguments: '{"goal_title":"Gym","dollars":12}' } }] }));
    const j = await (await chat(post('chat', { ...ok, message: 'make my gym penalty twelve bucks' }))).json();
    expect(j.action).toEqual({ goalTitle: 'Gym', dollars: 12 });
  });
  it('rate limits one ip', async () => {
    vi.stubGlobal('fetch', xai({ content: 'ok' }));
    let last = 200;
    for (let i = 0; i < 14; i++) last = (await chat(post('chat', ok, { 'x-forwarded-for': '10.9.9.9' }))).status;
    expect(last).toBe(429);
  });
});

describe('POST /api/ai/verify-photo', () => {
  it('validates the input', async () => {
    expect((await verify(post('verify-photo', { goalTitle: '', image: b64 }))).status).toBe(400);
    expect((await verify(post('verify-photo', { goalTitle: 'Gym', image: 'short' }))).status).toBe(400);
    expect((await verify(post('verify-photo', { goalTitle: 'Gym', image: '<script>' + b64 }))).status).toBe(400);
    expect((await verify(post('verify-photo', { goalTitle: 'Gym', image: 'A'.repeat(1_300_000) }))).status).toBe(413);
  });
  it('returns a verdict and sends the image as a data url', async () => {
    const f = xai({ content: '{"verified":false,"confidence":0.9,"reason":"A couch","roast":"Comfy."}' });
    vi.stubGlobal('fetch', f);
    const j = await (await verify(post('verify-photo', { goalTitle: 'Gym', image: b64 }))).json();
    expect(j).toEqual({ verified: false, confidence: 0.9, reason: 'A couch', roast: 'Comfy.' });
    const sent = JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(JSON.stringify(sent.messages)).toContain('data:image/jpeg;base64,');
  });
  it('502 when the model output is unusable', async () => {
    vi.stubGlobal('fetch', xai({ content: 'I cannot help with that' }));
    expect((await verify(post('verify-photo', { goalTitle: 'Gym', image: b64 }))).status).toBe(502);
  });
});

describe('POST /api/ai/coach', () => {
  const plan = { title: 'Gym', icon: 'goal-gym', days: [1, 3, 5], deadline: '18:00', minStayMinutes: 45, basePenaltyDollars: 5, radiusM: 150, tip: 'Go.' };
  it('validates input', async () => {
    expect((await coach(post('coach', { text: 'x' }))).status).toBe(400);
    expect((await coach(post('coach', { text: 'gym please', context: [1] }))).status).toBe(400);
  });
  it('returns a normalized plan', async () => {
    vi.stubGlobal('fetch', xai({ content: JSON.stringify({ ...plan, basePenaltyDollars: 999 }) }));
    const j = await (await coach(post('coach', { text: 'I want to hit the gym' }))).json();
    expect(j).toMatchObject({ title: 'Gym', days: [1, 3, 5], deadlineMinutes: 1080, basePenaltyCents: 4000 });
  });
  it('502 when the plan is invalid', async () => {
    vi.stubGlobal('fetch', xai({ content: '{"title":"","days":[]}' }));
    expect((await coach(post('coach', { text: 'I want to hit the gym' }))).status).toBe(502);
  });
});
