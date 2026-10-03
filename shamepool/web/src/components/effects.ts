'use client';
import confetti from 'canvas-confetti';

const COLORS = ['#24215B', '#75BFBC', '#F6C445', '#287A58', '#B83D49'];

export const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function fireConfetti(big = false): void {
  if (prefersReducedMotion()) return;
  confetti({ particleCount: big ? 220 : 120, spread: big ? 110 : 80, startVelocity: 42, origin: { y: 0.6 }, colors: COLORS });
  if (big) setTimeout(() => confetti({ particleCount: 90, angle: 60, spread: 70, origin: { x: 0, y: 0.7 }, colors: COLORS }), 200);
  if (big) setTimeout(() => confetti({ particleCount: 90, angle: 120, spread: 70, origin: { x: 1, y: 0.7 }, colors: COLORS }), 200);
}

export function vibrate(pattern: number | number[]): void {
  try { navigator.vibrate?.(pattern); } catch { /* unsupported */ }
}
