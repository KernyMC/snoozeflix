'use client';
import { getPrefs } from './voice';

export type SfxName = 'flake' | 'success' | 'cash' | 'nudge';

const cache = new Map<SfxName, HTMLAudioElement>();

/** Plays a short pre-generated sound effect (public/sfx). Silent when the user turned effects off or the browser blocks audio. */
export function playSfx(name: SfxName, volume = 0.7): void {
  if (typeof window === 'undefined' || !getPrefs().sfx) return;
  try {
    let a = cache.get(name);
    if (!a) { a = new Audio(`/sfx/${name}.mp3`); a.preload = 'auto'; cache.set(name, a); }
    a.volume = volume;
    a.currentTime = 0;
    void a.play().catch(() => { /* autoplay blocked: ignore */ });
  } catch { /* no audio support */ }
}
