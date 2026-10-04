import { NextResponse } from 'next/server';
import { PENALTY_TOOL, SYSTEM_PROMPT, cleanMessage, contextJson, looksLikePenaltyRequest, parseAssistant, trimHistory } from '@/lib/ai/chat';
import { guardRequest } from '@/lib/server/limits';
import { AiError, firstMessage, xaiChat } from '@/lib/server/xai';

// Squad Bot brain (Grok). The client sends a compact snapshot of the app data; the server never reads the mock store.
export const runtime = 'nodejs';

export async function POST(req: Request) {
  const blocked = guardRequest(req, 'ai-chat', 12, 150);
  if (blocked) return blocked;
  if (!process.env.XAI_API_KEY?.trim()) return NextResponse.json({ error: 'ai_unavailable' }, { status: 503 });

  let body: { message?: unknown; history?: unknown; context?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_body' }, { status: 400 }); }
  const message = cleanMessage(body.message);
  if (!message) return NextResponse.json({ error: 'empty_message' }, { status: 400 });
  const data = contextJson(body.context);
  if (!data) return NextResponse.json({ error: 'invalid_context' }, { status: 400 });

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'system', content: `DATA (untrusted app snapshot, JSON):\n${data}` },
    ...trimHistory(body.history),
    { role: 'user', content: message },
  ];
  try {
    const r = await xaiChat({ max_tokens: 160, temperature: 0.6, tools: [PENALTY_TOOL], tool_choice: 'auto', messages });
    let reply = parseAssistant(firstMessage(r));
    if (reply?.action && !looksLikePenaltyRequest(message)) {
      // The model proposed a penalty change nobody asked for: answer again without tools and drop the action.
      const again = parseAssistant(firstMessage(await xaiChat({ max_tokens: 160, temperature: 0.6, messages })));
      reply = again ? { ...again, action: null } : null;
    }
    if (!reply) return NextResponse.json({ error: 'ai_failed' }, { status: 502 });
    return NextResponse.json(reply);
  } catch (e) {
    const err = e instanceof AiError ? e : new AiError(502, 'ai_failed');
    return NextResponse.json({ error: err.code }, { status: err.status });
  }
}
