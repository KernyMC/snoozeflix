import { NextResponse } from 'next/server';
import { VERIFY_PROMPT, parseVerdict } from '@/lib/ai/verdict';
import { guardRequest } from '@/lib/server/limits';
import { AiError, firstMessage, xaiChat } from '@/lib/server/xai';

// Vision check for check-in photos (Grok). Fails closed on bad input; the client decides what to do if the AI is unavailable.
export const runtime = 'nodejs';

const MAX_IMAGE_CHARS = 1_200_000; // ~900 KB of base64; the client already resizes to 1024 px JPEG
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

export async function POST(req: Request) {
  if (!process.env.XAI_API_KEY?.trim()) return NextResponse.json({ error: 'ai_unavailable' }, { status: 503 });
  const blocked = guardRequest(req, 'ai-vision', 10, 150);
  if (blocked) return blocked;

  let body: { goalTitle?: unknown; image?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_body' }, { status: 400 }); }
  const goal = typeof body.goalTitle === 'string' ? body.goalTitle.replace(/\s+/g, ' ').trim().slice(0, 40) : '';
  const image = typeof body.image === 'string' ? body.image : '';
  if (!goal) return NextResponse.json({ error: 'invalid_goal' }, { status: 400 });
  if (image.length < 200 || !BASE64.test(image)) return NextResponse.json({ error: 'invalid_image' }, { status: 400 });
  if (image.length > MAX_IMAGE_CHARS) return NextResponse.json({ error: 'image_too_large' }, { status: 413 });

  try {
    const r = await xaiChat({
      max_tokens: 160,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: VERIFY_PROMPT },
        { role: 'user', content: [
          { type: 'text', text: `Activity or place the user claims: "${goal}". Does this photo plausibly show it?` },
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${image}`, detail: 'low' } },
        ] },
      ],
    }, 15_000);
    const verdict = parseVerdict(firstMessage(r)?.content, image.length);
    if (!verdict) return NextResponse.json({ error: 'ai_failed' }, { status: 502 });
    return NextResponse.json(verdict);
  } catch (e) {
    const err = e instanceof AiError ? e : new AiError(502, 'ai_failed');
    return NextResponse.json({ error: err.code }, { status: err.status });
  }
}
