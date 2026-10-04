'use client';
import { useSyncExternalStore } from 'react';
import { sanitizeSpeech } from './speech';

export interface Prefs { voice: boolean; notify: boolean; sfx: boolean }
const KEY = 'shamepool-prefs';
const SERVER: Prefs = { voice: false, notify: false, sfx: true };

function read(): Prefs {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Prefs>;
    return { voice: !!raw.voice, notify: !!raw.notify, sfx: raw.sfx !== false };
  } catch {
    return { ...SERVER };
  }
}

let prefs: Prefs | null = null;
const listeners = new Set<() => void>();
const current = (): Prefs => (prefs ??= read());

export function setPrefs(patch: Partial<Prefs>): void {
  prefs = { ...current(), ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* storage blocked: keep in memory */ }
  listeners.forEach((l) => l());
}
export const getPrefs = (): Prefs => (typeof window === 'undefined' ? SERVER : current());

export function usePrefs(): Prefs {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    getPrefs,
    () => SERVER,
  );
}

/* ---------- playback ---------- */
export type SpeakResult = 'ok' | 'empty' | 'blocked' | 'failed';

const urlCache = new Map<string, string>();
let audio: HTMLAudioElement | null = null;
let stopCurrent: (() => void) | null = null;
const listenersPlaying = new Set<() => void>();
let playingText: string | null = null;

const setPlaying = (t: string | null) => { playingText = t; listenersPlaying.forEach((l) => l()); };
export const usePlayingText = (): string | null =>
  useSyncExternalStore((cb) => { listenersPlaying.add(cb); return () => { listenersPlaying.delete(cb); }; }, () => playingText, () => null);

export function stopSpeaking(): void {
  stopCurrent?.();
}

async function fetchUrl(text: string): Promise<string | null> {
  const hit = urlCache.get(text);
  if (hit) return hit;
  try {
    const r = await fetch('/api/voice/speak', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
    if (!r.ok) return null;
    const url = URL.createObjectURL(await r.blob());
    urlCache.set(text, url);
    if (urlCache.size > 20) {
      const oldest = urlCache.keys().next().value as string;
      URL.revokeObjectURL(urlCache.get(oldest) as string);
      urlCache.delete(oldest);
    }
    return url;
  } catch {
    return null;
  }
}

/** Speaks `raw` with Benny the Penny's voice. Resolves when playback ends. Only one voice plays at a time. */
export async function speak(raw: string): Promise<SpeakResult> {
  const text = sanitizeSpeech(raw);
  if (!text) return 'empty';
  stopSpeaking();
  setPlaying(text);
  const url = await fetchUrl(text);
  if (!url) { setPlaying(null); return 'failed'; }
  if (playingText !== text) return 'ok'; // a newer request took over while we were fetching
  return new Promise<SpeakResult>((resolve) => {
    const a = new Audio(url);
    audio = a;
    const done = (r: SpeakResult) => {
      if (audio === a) { audio = null; stopCurrent = null; if (playingText === text) setPlaying(null); }
      resolve(r);
    };
    stopCurrent = () => { a.pause(); done('ok'); };
    a.onended = () => done('ok');
    a.onerror = () => done('failed');
    a.play().catch((e: unknown) => done((e as DOMException)?.name === 'NotAllowedError' ? 'blocked' : 'failed'));
  });
}

/* ---------- queue for auto-speaking ---------- */
let chain: Promise<unknown> = Promise.resolve();
let queued = 0;
/** Auto-speak lines one after another; drops lines when more than 3 are waiting. */
export function speakQueued(text: string): void {
  if (queued >= 3) return;
  queued++;
  chain = chain.then(() => speak(text)).catch(() => undefined).finally(() => { queued--; });
}
