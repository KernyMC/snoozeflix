import { NextResponse } from 'next/server';
import { COACH_PROMPT, normalizeCoach, parseJsonObject } from '@/lib/ai/coach';
import { contextJson } from '@/lib/ai/chat';
import { guardRequest } from '@/lib/server/limits';
import { AiError, firstMessage, xaiChat } from '@/lib/server/xai';

// Commitment coach (Grok): one sentence in, a validated goal plan out.
export const runtime = 'nodejs';

export async function POST(req: Request) {
  if (!process.env.XAI_API_KEY?.trim()) return NextResponse.json({ error: 'ai_unavailable' }, { status: 503 });
  const blocked = guardRequest(req, 'ai-coach', 8, 120);
  if (blocked) return blocked;

  let body: { text?: unknown; context?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_body' }, { status: 400 }); }
  const text = typeof body.text === 'string' ? body.text.replace(/\s+/g, ' ').trim().slice(0, 300) : '';
  if (text.length < 3) return NextResponse.json({ error: 'empty_text' }, { status: 400 });
  const data = body.context === undefined ? '{}' : contextJson(body.context);
  if (!data) return NextResponse.json({ error: 'invalid_context' }, { status: 400 });

  try {
    const r = await xaiChat({
      max_tokens: 260,
      temperature: 0.4,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: COACH_PROMPT },
        { role: 'user', content: `DATA (JSON): ${data}\nThe user says: ${text}` },
      ],
    });
    const plan = normalizeCoach(parseJsonObject(firstMessage(r)?.content));
    if (!plan) return NextResponse.json({ error: 'ai_failed' }, { status: 502 });
    return NextResponse.json(plan);
  } catch (e) {
    const err = e instanceof AiError ? e : new AiError(502, 'ai_failed');
    return NextResponse.json({ error: err.code }, { status: err.status });
  }
}
