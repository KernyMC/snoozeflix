'use client';
import { X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { formatCents, type PlanTier, useBilling } from '@/data';

/** Active goals each plan shows room for. Screen-level only: the data layer still allows 5 for everyone. */
export const GOAL_LIMITS: Record<PlanTier, number> = { free: 1, paid: 5 };
/** What the paid tier costs. */
export const PAID_TIER_PRICE_CENTS = 500;

// Kept in memory only: closing it lasts while moving between screens, and a reload brings it back.
let closed = false;

/** Free-tier reminder with the way to upgrade. Shows nothing on the paid tier. */
export function UpgradeBanner({ className = '' }: { className?: string }) {
  const { tier } = useBilling();
  const [hidden, setHidden] = useState(closed);
  if (tier !== 'free' || hidden) return null;
  const close = () => { closed = true; setHidden(true); };
  const free = GOAL_LIMITS.free;
  return (
    <aside aria-label="Free tier" className={`relative rounded-2xl border-2 border-sun bg-sun-light py-2 pl-3 pr-10 text-sm font-bold leading-snug shadow-chunky-sm [--edge:var(--color-sun)] ${className}`}>
      <p>
        <span className="mr-1.5 inline-block rounded-full bg-sun px-2 py-0.5 text-[11px] font-black uppercase tracking-wide">Free tier</span>
        {free} {free === 1 ? 'goal' : 'goals'}.{' '}
        <Link href="/settings#plan" className="font-black underline decoration-2 underline-offset-2">Pay {formatCents(PAID_TIER_PRICE_CENTS)} to upgrade</Link>{' '}
        and get all {GOAL_LIMITS.paid}.
      </p>
      <button type="button" onClick={close} aria-label="Close" className="absolute right-0 top-0 grid size-9 place-items-center rounded-2xl active:translate-y-px">
        <X size={16} strokeWidth={3.5} aria-hidden />
      </button>
    </aside>
  );
}
