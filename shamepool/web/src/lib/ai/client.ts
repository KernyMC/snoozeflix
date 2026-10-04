'use client';
import type { AiChatReply, AiVerdict, CoachPlan } from './types';

async function postJson<T>(path: string, body: unknown, timeoutMs: number): Promise<T | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal });
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null; // offline, timeout or blocked: callers fall back to the built-in behavior
  } finally {
    clearTimeout(timer);
  }
}

/** Squad Bot brain. null = unavailable, so the caller uses the keyword bot instead. */
export const askAi = (message: string, history: { from: 'me' | 'bot'; text: string }[], context: Record<string, unknown>) =>
  postJson<AiChatReply>('/api/ai/chat', { message, history, context }, 14_000);

/** Vision verdict for a check-in photo. null = the AI check was unavailable (the check-in then fails open, flagged). */
export const verifyPhotoAi = (goalTitle: string, imageBase64: string) =>
  postJson<AiVerdict>('/api/ai/verify-photo', { goalTitle, image: imageBase64 }, 18_000);

/** Turns a sentence into a goal plan. null = unavailable. */
export const coachAi = (text: string, context?: Record<string, unknown>) =>
  postJson<CoachPlan>('/api/ai/coach', { text, context }, 14_000);
