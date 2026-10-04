'use client';
import { Check, Droplets, Heart, LifeBuoy, PawPrint, Trophy, Utensils } from 'lucide-react';
import { useState } from 'react';
import {
  CHARITIES, charityById, formatCents, proposeDonation, setCharity, useCharityStatus, useDonations, useNow, useOpenCashout, useSquad,
  type CharityKind,
} from '@/data';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/ui/Button';
import { Card, Pill } from '@/components/ui/Card';
import { MoneyText } from '@/components/ui/Money';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { EmptyState, errorText, ListSkeleton } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';

const KIND_ICON: Record<CharityKind, typeof Heart> = { food: Utensils, water: Droplets, animals: PawPrint, kids: Trophy, disaster: LifeBuoy };

function timeLeft(ms: number): string {
  if (ms <= 0) return 'any moment';
  const s = Math.ceil(ms / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${String(sec).padStart(2, '0')}s`;
  return `${sec}s`;
}
const windowLabel = (ms: number) => (ms >= 86_400_000 ? `${Math.round(ms / 86_400_000)} days` : `${Math.max(1, Math.round(ms / 60_000))} minutes`);

function Charity() {
  const squad = useSquad();
  const status = useCharityStatus();
  const open = useOpenCashout();
  const donations = useDonations();
  const now = useNow(1000);
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  if (!squad || !status) return <ListSkeleton rows={3} h="h-32" />;

  const charity = charityById(status.charityId);
  const full = squad.poolBalanceCents >= squad.poolGoalCents;
  const voting = !!open;
  const locked = open?.kind === 'donate';
  const left = status.deadlineAt ? status.deadlineAt - now : null;
  const elapsed = status.deadlineAt ? 1 - Math.max(0, Math.min(1, (status.deadlineAt - now) / status.windowMs)) : 0;
  const Icon = KIND_ICON[charity.kind];

  const pick = async (id: string) => {
    if (id === status.charityId || busy) return;
    setBusy(id);
    const r = await setCharity(id);
    setBusy(null);
    toast(r.ok ? `Charity set to ${charityById(id).name}` : errorText(r.error), r.ok ? 'success' : 'error');
  };
  const donateNow = async () => {
    setBusy('donate');
    const r = await proposeDonation();
    setBusy(null);
    toast(r.ok ? 'Donation proposed. Your squad votes now.' : errorText(r.error), r.ok ? 'success' : 'error');
  };

  return (
    <div className="space-y-5">
      <h1 className="font-display font-black text-3xl flex items-center gap-2"><Heart className="text-ember" fill="currentColor" strokeWidth={0} /> Charity</h1>

      <Card tone="sun" className="space-y-1 text-sm font-bold text-ink-soft">
        <p className="font-display font-black text-base text-ink">What happens to a full pool?</p>
        <p>Your squad has <b className="text-ink">{windowLabel(status.windowMs)}</b> to spend it together. If nobody does, the money goes to your charity. Nobody gets it back and nobody profits.</p>
      </Card>

      <section aria-labelledby="st" className="space-y-3">
        <h2 id="st" className="font-display font-black text-xl">Pool status</h2>
        <Card className="space-y-3">
          <div className="flex items-baseline justify-between gap-2">
            <p className="font-extrabold">{squad.poolGoalName}</p>
            <p className="font-bold text-ink-soft"><MoneyText cents={squad.poolBalanceCents} kind="pool" /> of <MoneyText cents={squad.poolGoalCents} /></p>
          </div>
          <ProgressBar value={squad.poolGoalCents ? squad.poolBalanceCents / squad.poolGoalCents : 0} tone="sun" label="Pool progress" />

          {!full && <p className="text-sm font-bold text-ink-soft">The clock starts the moment the pool is full.</p>}

          {full && !voting && left !== null && (
            <div className="space-y-2" role="timer" aria-label={`Goes to ${charity.name} in ${timeLeft(left)}`}>
              <div className="flex items-center justify-between">
                <p className="text-xs font-extrabold uppercase tracking-wide text-ink-soft">Goes to {charity.name} in</p>
                <Pill tone={left < 3_600_000 ? 'ember' : 'sky'}>{timeLeft(left)}</Pill>
              </div>
              <ProgressBar value={elapsed} tone={left < 3_600_000 ? 'ember' : 'sky'} label="Time used" />
            </div>
          )}
          {full && voting && <p className="text-sm font-extrabold text-sky-dark">A vote is in progress, so the clock waits.</p>}

          {full && !voting && (
            <div className="space-y-2 pt-1">
              <Button variant="pool" onClick={donateNow} loading={busy === 'donate'}>Donate {formatCents(squad.poolGoalCents)} now (squad vote)</Button>
              <Button variant="secondary" href="/squad">Spend it together instead</Button>
            </div>
          )}
          {full && voting && <Button variant="secondary" href="/squad">Go to the vote</Button>}
        </Card>
      </section>

      <section aria-labelledby="pk" className="space-y-3">
        <h2 id="pk" className="font-display font-black text-xl">Your squad&apos;s charity</h2>
        {locked && <p className="text-sm font-bold text-ink-soft">The charity is locked while a donation vote is open.</p>}
        <div className="space-y-2" role="radiogroup" aria-label="Charity">
          {CHARITIES.map((c) => {
            const on = c.id === status.charityId;
            const I = KIND_ICON[c.kind];
            return (
              <button key={c.id} type="button" role="radio" aria-checked={on} disabled={locked || !!busy} onClick={() => pick(c.id)}
                className={`w-full text-left flex items-center gap-3 rounded-2xl border-2 p-3 shadow-chunky-sm active:translate-y-[2px] active:shadow-none disabled:opacity-60 ${
                  on ? 'border-sky bg-sky-light [--edge:var(--color-sky-dark)]' : 'border-surface-line bg-white [--edge:var(--color-surface-line)]'}`}>
                <span className={`size-12 shrink-0 rounded-xl grid place-items-center ${on ? 'bg-sky text-white' : 'bg-surface-muted text-ink-soft'}`}><I size={24} strokeWidth={2.5} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block font-display font-black">{c.name}</span>
                  <span className="block text-sm font-bold text-ink-soft">{c.blurb}</span>
                </span>
                {on && <Check className="text-sky-dark shrink-0" strokeWidth={3} aria-label="Selected" />}
              </button>
            );
          })}
        </div>
        <p className="flex items-center gap-2 text-sm font-bold text-ink-soft"><Icon size={16} /> Selected: {charity.name}</p>
      </section>

      <section aria-labelledby="hs">
        <h2 id="hs" className="font-display font-black text-xl mb-2">Donations</h2>
        {donations.length === 0 ? (
          <EmptyState title="Nothing donated yet" line="When a full pool goes unspent, it shows up here." mood="sleepy" />
        ) : (
          <ul className="space-y-2">
            {donations.map((d) => (
              <li key={d.id} className="flex items-center justify-between rounded-xl border-2 border-surface-line bg-white px-3 py-2.5">
                <span className="font-extrabold">{charityById(d.charityId).name}
                  <span className="block text-xs font-bold text-ink-faint">{d.reason === 'vote' ? 'Voted by the squad' : 'Nobody spent it in time'} · {new Date(d.createdAt).toLocaleDateString()}</span>
                </span>
                <MoneyText cents={d.amountCents} kind="gain" />
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-center text-xs font-bold text-ink-faint">Demo: donations are simulated. No real money moves.</p>
    </div>
  );
}

export default function Page() {
  return <AppShell><Charity /></AppShell>;
}
