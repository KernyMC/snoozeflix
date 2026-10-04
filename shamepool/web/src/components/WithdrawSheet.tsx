'use client';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { formatCents, requestWithdrawal, type Wallet } from '@/data';
import { fireConfetti } from './effects';
import { playSfx } from '@/lib/sfx';
import { Icon } from './ui/Icon';
import { Button } from './ui/Button';
import { dollarsToCents, Field } from './ui/Field';
import { useToast } from './ui/Toast';

export function formatCooldown(ms: number): string {
  if (ms >= 3600_000) return `${Math.round(ms / 3600_000)} hours`;
  return `${Math.round(ms / 1000)} seconds`;
}

export function WithdrawSheet({ open, onClose, wallet }: { open: boolean; onClose: () => void; wallet: Wallet }) {
  const { toast } = useToast();
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (open) { setAmount(''); setError(null); } }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const cents = dollarsToCents(amount);
  const set = (c: number) => { setAmount((c / 100).toFixed(2).replace(/\.00$/, '')); setError(null); };
  const chips: [string, number][] = [
    ['Min', wallet.minWithdrawCents], ['Half', Math.floor(wallet.availableCents / 2 / 100) * 100], ['Max', wallet.availableCents],
  ];

  const submit = async () => {
    if (busy) return;
    if (!Number.isInteger(cents) || cents <= 0) return setError('Enter an amount.');
    if (cents < wallet.minWithdrawCents) return setError(`Minimum is ${formatCents(wallet.minWithdrawCents)}.`);
    if (cents > wallet.availableCents) return setError(`You can withdraw up to ${formatCents(wallet.availableCents)} right now.`);
    setBusy(true);
    const r = await requestWithdrawal(cents);
    setBusy(false);
    if (r.ok) {
      fireConfetti();
      playSfx('cash');
      toast('Withdrawal started. Cooling off...', 'success');
      return onClose();
    }
    if (r.error === 'withdrawal_pending') setError('You already have a withdrawal in progress.');
    else if (r.error === 'insufficient_available') setError(`You can withdraw up to ${formatCents(Number(r.meta?.availableCents ?? 0))} right now.`);
    else if (r.error === 'below_minimum') setError(`Minimum is ${formatCents(wallet.minWithdrawCents)}.`);
    else setError('Could not start the withdrawal. Try again.');
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[65] bg-black/40 flex items-end justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose} role="dialog" aria-modal="true" aria-label="Withdraw money">
          <motion.div className="w-full max-w-md bg-white rounded-t-3xl p-5 pb-8 space-y-4" initial={{ y: 400 }} animate={{ y: 0 }} exit={{ y: 400 }}
            transition={{ type: 'spring', stiffness: 350, damping: 32 }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-display font-black text-2xl">Withdraw</h2>
              <button onClick={onClose} aria-label="Close" className="size-11 -mr-2 grid place-items-center text-ink-faint"><X size={26} strokeWidth={3} /></button>
            </div>
            <p className="font-bold text-ink-soft">
              Available now: <b className="text-ink tabular">{formatCents(wallet.availableCents)}</b>
              {wallet.stakeCents > 0 && <> · <span title="Locked"><Icon name="lock" /> {formatCents(wallet.stakeCents)} stays at stake</span></>}
            </p>
            <Field label="Amount ($)" inputMode="decimal" value={amount} onChange={(e) => { setAmount(e.target.value); setError(null); }}
              placeholder="0" error={error} autoFocus />
            <div className="grid grid-cols-3 gap-2">
              {chips.map(([label, c]) => (
                <button key={label} type="button" onClick={() => set(c)} disabled={c < wallet.minWithdrawCents || c > wallet.availableCents}
                  className="rounded-xl border-2 border-surface-line bg-white min-h-11 font-display font-extrabold text-primary disabled:opacity-40 active:translate-y-px">
                  {label}
                </button>
              ))}
            </div>
            <div className="rounded-2xl bg-surface-muted p-3 text-sm font-bold text-ink-soft space-y-1">
              <p><Icon name="cash" /> To: Capital One ••••4821</p>
              <p><Icon name="hourglass" /> Arrives in {formatCooldown(wallet.cooldownMs)}. You can cancel until then.</p>
              <p><Icon name="chat" /> Your squad will see it in the feed.</p>
            </div>
            <Button onClick={submit} loading={busy} disabled={wallet.availableCents < wallet.minWithdrawCents}>Confirm withdrawal</Button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
