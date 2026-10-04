// Server-only wrapper for the xAI (Grok) chat API. The key never reaches the browser.
export class AiError extends Error {
  constructor(public status: number, public code: 'ai_unavailable' | 'ai_failed' | 'rate_limited') {
    super(code);
  }
}

export interface XaiMessage { content?: string | null; tool_calls?: { function?: { name?: string; arguments?: string } }[] }
export interface XaiResponse { choices?: { message?: XaiMessage }[] }

export const xaiModel = (): string => process.env.XAI_MODEL?.trim() || 'grok-4.20-0309-non-reasoning';

export async function xaiChat(body: Record<string, unknown>, timeoutMs = 12_000): Promise<XaiResponse> {
  const key = process.env.XAI_API_KEY?.trim();
  if (!key) throw new AiError(503, 'ai_unavailable');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: xaiModel(), ...body }),
      signal: ctrl.signal,
    });
    if (r.status === 429) throw new AiError(429, 'rate_limited');
    if (!r.ok) throw new AiError(502, 'ai_failed');
    return (await r.json()) as XaiResponse;
  } catch (e) {
    if (e instanceof AiError) throw e;
    throw new AiError(502, 'ai_failed'); // network error or timeout; never include the key in messages
  } finally {
    clearTimeout(timer);
  }
}

export const firstMessage = (r: XaiResponse): XaiMessage | undefined => r.choices?.[0]?.message;
