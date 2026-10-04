'use client';
import { useState } from 'react';
import { cancelWithdrawal, formatCents, formatCountdown, useNow, useWallet, useWithdrawals } from '@/data';
import { AppShell } from '@/components/AppShell';
import { Icon } from '@/components/ui/Icon';
import { WithdrawSheet } from '@/components/WithdrawSheet';
import { Button } from '@/components/ui/Button';
import { Card, Pill } from '@/components/ui/Card';
import { MoneyText } from '@/components/ui/Money';
import { ListSkeleton } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';

function Wallet() {
  const wallet = useWallet();
  const withdrawals = useWithdrawals();
  const now = useNow(1000);
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!wallet) return <ListSkeleton rows={3} h="h-28" />;

  const pending = withdrawals.find((w) => w.status === 'pending');
  const history = withdrawals.filter((w) => w.status !== 'pending').slice(0, 10);
  const cancel = async (id: string) => {
    setBusy(true);
    const r = await cancelWithdrawal(id);
    setBusy(false);
    toast(r.ok ? 'Cancelled. Money is back in your balance.' : 'Could not cancel. It may have already landed.', r.ok ? 'success' : 'error');
  };

  return (
    <div className="space-y-5">
      <h1 className="font-display font-black text-3xl">Wallet</h1>

      <Card className="space-y-3">
        <p className="text-xs font-extrabold uppercase tracking-wide text-ink-soft">Available to withdraw</p>
        <MoneyText cents={wallet.availableCents} className="text-5xl" />
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-surface-muted py-2"><p className="text-[11px] font-extrabold uppercase text-ink-soft">Balance</p><MoneyText cents={wallet.balanceCents} /></div>
          <div className="rounded-xl bg-sun-light py-2"><p className="text-[11px] font-extrabold uppercase text-sun-dark"><Icon name="lock" /> At stake</p><MoneyText cents={wallet.stakeCents} kind="pool" /></div>
          <div className="rounded-xl bg-sky-light py-2"><p className="text-[11px] font-extrabold uppercase text-sky-dark">Pending</p><MoneyText cents={wallet.pendingCents} /></div>
        </div>
        <Button onClick={() => setOpen(true)} disabled={!!pending || wallet.availableCents < wallet.minWithdrawCents}>Withdraw</Button>
        {pending ? <p className="text-center text-sm font-bold text-ink-soft">One withdrawal at a time. Wait for it or cancel it.</p>
          : wallet.balanceCents === 0 ? <p className="text-center text-sm font-bold text-ink-soft">Your balance is empty. Nothing to withdraw.</p>
          : wallet.availableCents < wallet.minWithdrawCents ? <p className="text-center text-sm font-bold text-ink-soft">Everything is at stake right now. Finish your check-ins to free it up.</p> : null}
      </Card>

      {pending && (
        <Card tone="sky" className="space-y-2" aria-label="Withdrawal in progress">
          <div className="flex items-center justify-between">
            <p className="font-display font-black text-xl"><Icon name="hourglass" size={26} /> {formatCents(pending.amountCents)} cooling off</p>
            <Pill tone="sky">{now >= pending.availableAt ? 'Landing…' : formatCountdown(pending.availableAt - now)}</Pill>
          </div>
          <p className="text-sm font-bold text-ink-soft">To {pending.destination}. You can still change your mind.</p>
          <Button variant="secondary" loading={busy} onClick={() => cancel(pending.id)}>Cancel withdrawal</Button>
        </Card>
      )}

      <section aria-labelledby="stake">
        <h2 id="stake" className="font-display font-black text-xl mb-1">Why is money locked?</h2>
        <p className="text-sm font-bold text-ink-soft mb-2">We keep enough to cover your worst case over the next 3 days. If you flake everything, you can still pay. That keeps it fair for your friends.</p>
        {wallet.stake.length === 0 ? <p className="font-bold text-ink-faint">Nothing is locked right now.</p> : (
          <ul className="space-y-2">
            {wallet.stake.map((s) => (
              <li key={s.goalId} className="flex items-center justify-between rounded-xl border-2 border-surface-line bg-white px-3 py-2.5">
                <span className="font-extrabold">{s.emoji} {s.title}<span className="block text-xs font-bold text-ink-faint">{s.occurrences} check-in{s.occurrences > 1 ? 's' : ''} ahead</span></span>
                <MoneyText cents={s.cents} kind="pool" />
              </li>
            ))}
          </ul>
        )}
      </section>

      <Card tone="sun" className="text-sm font-bold text-ink-soft">
        <p className="font-display font-black text-base text-ink mb-1"><Icon name="pizza" size={24} /> The pool is shared</p>
        Penalties you already paid stay in the pool. It is spent together by squad vote, never paid out as cash. That is what keeps this from being gambling.
      </Card>

      {history.length > 0 && (
        <section aria-labelledby="hist">
          <h2 id="hist" className="font-display font-black text-xl mb-2">History</h2>
          <ul className="space-y-2">
            {history.map((w) => (
              <li key={w.id} className="flex items-center justify-between rounded-xl border-2 border-surface-line bg-white px-3 py-2.5">
                <span className="font-extrabold">{w.status === 'completed' ? <><Icon name="cash" /> Withdrawn</> : <><Icon name="undo" /> Cancelled</>}<span className="block text-xs font-bold text-ink-faint">{new Date(w.createdAt).toLocaleDateString()}</span></span>
                <MoneyText cents={w.amountCents} kind={w.status === 'completed' ? 'neutral' : 'pool'} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <WithdrawSheet open={open} onClose={() => setOpen(false)} wallet={wallet} />
    </div>
  );
}

export default function Page() {
  return <AppShell><Wallet /></AppShell>;
}
