'use client';
import { animate, useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { formatCents } from '@/data';

type Kind = 'neutral' | 'loss' | 'gain' | 'pool';
const kinds: Record<Kind, string> = { neutral: 'text-ink', loss: 'text-ember', gain: 'text-leaf-dark', pool: 'text-sun-dark' };

export function MoneyText({ cents, kind = 'neutral', className = '', signed }: { cents: number; kind?: Kind; className?: string; signed?: boolean }) {
  const txt = signed && cents !== 0 ? `${cents < 0 ? '-' : '+'}${formatCents(Math.abs(cents))}` : formatCents(cents);
  return <span className={`tabular font-display font-black ${kinds[kind]} ${className}`}>{txt}</span>;
}

/** Counts up (cents) over 600 ms; animates again whenever `cents` changes. */
export function CountUpMoney({ cents, kind = 'neutral', className = '', signed }: { cents: number; kind?: Kind; className?: string; signed?: boolean }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(cents);
  const prev = useRef(cents);
  useEffect(() => {
    if (reduce || prev.current === cents) { setShown(cents); prev.current = cents; return; }
    const controls = animate(prev.current, cents, { duration: 0.6, ease: 'easeOut', onUpdate: (v) => setShown(Math.round(v)) });
    prev.current = cents;
    return () => controls.stop();
  }, [cents, reduce]);
  return <MoneyText cents={shown} kind={kind} className={className} signed={signed} />;
}
