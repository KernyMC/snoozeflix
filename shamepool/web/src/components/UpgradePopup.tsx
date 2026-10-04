'use client';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowDown, Check, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { formatCents, isExpired, setPlanTier, TRIAL_DAYS, trialEnd, useBilling, useMe, useNow, type PlanStart } from '@/data';
import { fireConfetti } from './effects';
import { closeUpgrade, GOAL_LIMITS, PAID_TIER_PRICE_CENTS, useUpgradeOpen } from './UpgradeBanner';
import { Button } from './ui/Button';
import { Flakey } from './ui/Flakey';
import { errorText } from './ui/States';
import { useToast } from './ui/Toast';

/** "Oct 11" */
export const shortDate = (ms: number): string => new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

const ORDER: PlanStart[] = ['monthly', 'trial'];

/** One of the two ways to start. The whole card is the radio button. */
function Option({ value, picked, onPick, label, title, note, children }: {
  value: PlanStart; picked: boolean; onPick: (v: PlanStart) => void; label: string; title: string; note: string; children?: React.ReactNode;
}) {
  return (
    <button type="button" role="radio" aria-checked={picked} tabIndex={picked ? 0 : -1} data-start={value} onClick={() => onPick(value)}
      className={`block w-full rounded-2xl border-2 p-4 text-left transition-colors active:translate-y-[2px] ${
        picked ? 'border-sun bg-white text-ink shadow-chunky [--edge:var(--color-sun)]' : 'border-white/25 bg-white/10 text-white'}`}>
      <span className="flex items-start gap-3">
        <span className="min-w-0 flex-1">
          <span className={`block text-xs font-extrabold uppercase tracking-wide ${picked ? 'text-sun-dark' : 'text-sun'}`}>{label}</span>
          <span className="block font-display text-2xl font-black leading-tight">{title}</span>
          <span className={`block text-sm font-bold ${picked ? 'text-ink-soft' : 'text-white/75'}`}>{note}</span>
        </span>
        <span aria-hidden className={`mt-1 grid size-7 shrink-0 place-items-center rounded-full border-2 ${picked ? 'border-sun bg-sun text-ink' : 'border-white/50'}`}>
          {picked && <Check size={16} strokeWidth={4} />}
        </span>
      </span>
      {children}
    </button>
  );
}

/**
 * The upgrade pop-up: pick monthly billing from today, or a free trial that charges on the day after it ends.
 * Mounted once for the whole app and opened with `openUpgrade()`.
 */
export function UpgradePopup() {
  const open = useUpgradeOpen();
  const me = useMe();
  const billing = useBilling();
  const now = useNow(60_000);
  const { toast } = useToast();
  const router = useRouter();
  const [start, setStart] = useState<PlanStart>('monthly');
  const [busy, setBusy] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

  // There is nothing to sell once signed out or already paid.
  const show = open && !!me && billing.tier === 'free';
  useEffect(() => { if (open && !show) closeUpgrade(); }, [open, show]);

  // Start from the first option each time, take the focus while open and hand it back afterwards.
  useEffect(() => {
    if (!show) return;
    setStart('monthly');
    setBusy(false);
    const before = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeUpgrade(); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); before?.focus?.(); };
  }, [show]);

  const price = formatCents(PAID_TIER_PRICE_CENTS);
  const chargeDay = shortDate(trialEnd(now));
  const hasCard = billing.payments.some((p) => !isExpired(p, now));
  const trial = start === 'trial';

  const pick = (v: PlanStart) => setStart(v);
  const onArrows = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = ORDER[(ORDER.indexOf(start) + step + ORDER.length) % ORDER.length];
    setStart(next);
    e.currentTarget.querySelector<HTMLElement>(`[data-start="${next}"]`)?.focus();
  };

  const go = async () => {
    if (busy) return;
    setBusy(true);
    const r = await setPlanTier('paid', start);
    if (!r.ok) { setBusy(false); return toast(errorText(r.error), 'error'); }
    fireConfetti();
    toast(trial ? `Free trial started. ${price} a month from ${chargeDay}.` : 'You are on the paid tier', 'success');
    closeUpgrade();
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/50 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={closeUpgrade}>
          <motion.div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="upgrade-title" onClick={(e) => e.stopPropagation()}
            className="relative max-h-full w-full max-w-md overflow-y-auto overscroll-contain rounded-3xl border-2 border-primary-dark bg-primary px-5 pb-6 pt-7 text-white outline-none
              bg-[radial-gradient(120%_55%_at_50%_0%,color-mix(in_srgb,var(--color-sun)_38%,transparent),transparent_70%)]"
            initial={{ y: 40, scale: 0.96 }} animate={{ y: 0, scale: 1 }} exit={{ y: 40, scale: 0.96 }} transition={{ type: 'spring', stiffness: 380, damping: 30 }}>
            <button type="button" onClick={closeUpgrade} aria-label="Close" className="absolute right-3 top-3 grid size-10 place-items-center rounded-full bg-white/15 text-white">
              <X size={20} strokeWidth={3.5} aria-hidden />
            </button>

            <div className="flex justify-center"><Flakey mood="happy" size={116} /></div>
            <h2 id="upgrade-title" className="mt-1 text-center font-display text-[2.6rem] font-black leading-[1.02] text-sun">Unlock all {GOAL_LIMITS.paid} goals</h2>
            <p className="mt-2 text-center text-lg font-extrabold text-white/85">The free tier stops at {GOAL_LIMITS.free}.</p>

            <div role="radiogroup" aria-label="How to start" onKeyDown={onArrows} className="mt-5 space-y-3">
              <Option value="monthly" picked={!trial} onPick={pick} label="Monthly" title={`${price} a month`} note={`Charged ${price} today, then every month.`} />
              <Option value="trial" picked={trial} onPick={pick} label="Free trial" title={`${TRIAL_DAYS} days free`} note={`Then ${price} a month, charged automatically.`}>
                <span className={`mt-3 block rounded-xl p-3 text-sm font-extrabold ${trial ? 'bg-surface-muted' : 'bg-white/10'}`}>
                  <span className="flex items-center justify-between gap-3">
                    <span>Today</span>
                    <span className="tabular">{TRIAL_DAYS} days free · {formatCents(0)}</span>
                  </span>
                  <ArrowDown aria-hidden size={16} strokeWidth={3.5} className={`my-1 ${trial ? 'text-ink-faint' : 'text-white/50'}`} />
                  <span className="flex items-center justify-between gap-3">
                    <span>{chargeDay} <span className={trial ? 'text-ink-soft' : 'text-white/70'}>(day {TRIAL_DAYS + 1})</span></span>
                    <span className="tabular">Auto-charge · {price}</span>
                  </span>
                </span>
              </Option>
            </div>

            <div className="mt-5 space-y-3">
              {hasCard ? (
                <Button variant="pool" type="button" loading={busy} onClick={go}>{trial ? `Start ${TRIAL_DAYS}-day free trial` : `Start monthly for ${price}`}</Button>
              ) : (
                <>
                  <Button variant="pool" type="button" onClick={() => { closeUpgrade(); router.push('/settings#acct'); }}>Add a card first</Button>
                  <p className="text-center text-sm font-extrabold text-white/85">Both options need a saved card. Add one under Payment methods.</p>
                </>
              )}
              <p className="text-center text-xs font-bold text-white/70">
                {!hasCard ? `Nothing is charged until you save a card and pick an option. ` : ''}
                {trial
                  ? `Free for ${TRIAL_DAYS} days. On day ${TRIAL_DAYS + 1} (${chargeDay}) your saved card is charged ${price}, then ${price} every month.`
                  : `Your saved card is charged ${price} today, then ${price} every month.`}
                {' '}Switch back to free any time in your profile.
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
