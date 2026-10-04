'use client';
import { X } from 'lucide-react';
import { useEffect, useSyncExternalStore } from 'react';
import { formatCents, type PlanTier, useBilling, useMe } from '@/data';

/** Active goals each plan shows room for. Screen-level only: the data layer still allows 5 for everyone. */
export const GOAL_LIMITS: Record<PlanTier, number> = { free: 1, paid: 5 };
/** What the paid tier costs. */
export const PAID_TIER_PRICE_CENTS = 500;

/*
 * Closing the banner is remembered on this device for the user who closed it, so it stays away across
 * screens and reloads. Signing out forgets it, so the banner is back the next time they sign in.
 */
const CLOSED_KEY = 'shamepool-upgrade-banner-closed';
let memory: string | null = null; // stands in when storage is blocked
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const closedBy = (): string | null => { try { return localStorage.getItem(CLOSED_KEY); } catch { return memory; } };
function setClosedBy(userId: string | null) {
  memory = userId;
  try {
    if (userId) localStorage.setItem(CLOSED_KEY, userId); else localStorage.removeItem(CLOSED_KEY);
  } catch { /* storage blocked: memory only */ }
  listeners.forEach((l) => l());
}

/* Whether the upgrade pop-up is showing. One pop-up serves every upgrade button; it is mounted in Providers. */
let upgradeOpen = false;
const openListeners = new Set<() => void>();
const setUpgradeOpen = (v: boolean) => { if (upgradeOpen !== v) { upgradeOpen = v; openListeners.forEach((l) => l()); } };
export const openUpgrade = () => setUpgradeOpen(true);
export const closeUpgrade = () => setUpgradeOpen(false);
export const useUpgradeOpen = (): boolean =>
  useSyncExternalStore((l) => { openListeners.add(l); return () => { openListeners.delete(l); }; }, () => upgradeOpen, () => false);

/** Forgets a closed banner once nobody is signed in. Mounted once for the whole app. */
export function UpgradeBannerReset() {
  const me = useMe();
  useEffect(() => { if (me === null && closedBy()) setClosedBy(null); }, [me]);
  return null;
}

/** Free-tier reminder with the way to upgrade. Shows nothing on the paid tier. */
export function UpgradeBanner({ className = '' }: { className?: string }) {
  const { tier } = useBilling();
  const me = useMe();
  // Until the page has loaded on the device, treat it as closed so it never flashes for someone who closed it.
  const closer = useSyncExternalStore(subscribe, closedBy, () => undefined);
  if (tier !== 'free' || !me || closer === undefined || closer === me.id) return null;
  const close = () => setClosedBy(me.id);
  const free = GOAL_LIMITS.free;
  return (
    <aside aria-label="Free tier" className={`relative rounded-2xl border-2 border-sun bg-sun-light py-2 pl-3 pr-10 text-sm font-bold leading-snug shadow-chunky-sm [--edge:var(--color-sun)] ${className}`}>
      <p>
        <span className="mr-1.5 inline-block rounded-full bg-sun px-2 py-0.5 text-[11px] font-black uppercase tracking-wide">Free tier</span>
        {free} {free === 1 ? 'goal' : 'goals'}.{' '}
        <button type="button" onClick={openUpgrade} aria-haspopup="dialog" className="font-black underline decoration-2 underline-offset-2">Pay {formatCents(PAID_TIER_PRICE_CENTS)} to upgrade</button>{' '}
        and get all {GOAL_LIMITS.paid}.
      </p>
      <button type="button" onClick={close} aria-label="Close" className="absolute right-0 top-0 grid size-9 place-items-center rounded-2xl active:translate-y-px">
        <X size={16} strokeWidth={3.5} aria-hidden />
      </button>
    </aside>
  );
}
