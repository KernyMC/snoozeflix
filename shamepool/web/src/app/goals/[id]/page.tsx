'use client';
import { ArrowLeft, Flame } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { forceFlake, formatCents, formatCountdown, formatDeadline, nextPenaltyCents, useGoal, useGoalHistory, useMe } from '@/data';
import { AppShell } from '@/components/AppShell';
import { DAY_NAMES, useGoalStatus } from '@/components/goalStatus';
import { Button } from '@/components/ui/Button';
import { Card, Pill } from '@/components/ui/Card';
import { Flakey } from '@/components/ui/Flakey';
import { GoalIcon, Icon } from '@/components/ui/Icon';
import { EmptyState, errorText, Skeleton } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import type { Goal } from '@/data';
import { DEMO_ENABLED } from '@/lib/demo';

const Map = dynamic(() => import('@/components/LocationPickerMap'), { ssr: false, loading: () => <Skeleton className="h-40 w-full" /> });
const DEMO = DEMO_ENABLED;

function Detail({ goal }: { goal: Goal }) {
  const me = useMe();
  const router = useRouter();
  const { toast } = useToast();
  const { checkins, penalties } = useGoalHistory(goal.id);
  const { state, msLeft } = useGoalStatus(goal);
  const [busy, setBusy] = useState(false);
  const mine = me?.id === goal.userId;

  const history = [
    ...checkins.map((c) => ({ date: c.localDate, kind: 'ok' as const, text: 'Checked in', cents: 0 })),
    ...penalties.map((p) => ({ date: p.localDate, kind: 'flake' as const, text: 'Flaked', cents: p.amountCents })),
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 14);

  const cta = {
    done: { label: <>Done today <Icon name="check" /></>, off: true }, flaked: { label: <>Flaked today <Icon name="money-wings" /></>, off: true },
    rest: { label: 'Not due today', off: true }, late: { label: "Deadline passed", off: true }, due: { label: 'Check in', off: false },
  }[state];

  const flake = async () => {
    setBusy(true);
    const r = await forceFlake(goal.id);
    setBusy(false);
    if (!r.ok) toast(errorText(r.error), 'error');
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <button onClick={() => router.push('/home')} aria-label="Back" className="size-11 -ml-2 grid place-items-center"><ArrowLeft strokeWidth={3} /></button>
        <div className="size-12 rounded-2xl bg-sky-light grid place-items-center text-2xl"><GoalIcon value={goal.emoji} size={30} /></div>
        <h1 className="font-display font-black text-2xl leading-tight flex-1 min-w-0 truncate">{goal.title}</h1>
        <span className={`flex items-center gap-1 font-display font-black ${goal.streak > 0 ? 'text-flame' : 'text-ink-faint'}`}><Flame fill="currentColor" size={22} aria-hidden />{goal.streak}</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card tone={state === 'due' ? 'sky' : 'default'}>
          <p className="text-xs font-extrabold uppercase tracking-wide text-ink-soft">{state === 'due' ? 'Due in' : 'Deadline'}</p>
          <p className="font-display font-black text-2xl">{state === 'due' ? formatCountdown(msLeft) : formatDeadline(goal.deadlineMinutes)}</p>
        </Card>
        <Card tone="ember">
          <p className="text-xs font-extrabold uppercase tracking-wide text-ember-dark">Next miss</p>
          <p className="font-display font-black text-2xl text-ember tabular">-{formatCents(nextPenaltyCents(goal))}</p>
        </Card>
      </div>

      <div className="flex flex-wrap gap-1.5 items-center">
        {DAY_NAMES.map((d, i) => goal.daysOfWeek.includes(i) && <Pill key={d} tone="gray">{d}</Pill>)}
        <Pill tone="gray"><Icon name="pin" /> {goal.radiusM} m</Pill><Pill tone="gray"><Icon name="clock" /> {goal.minStayMinutes} min</Pill>
        {goal.consecutiveFlakes > 0 && <Pill tone="ember"><Icon name="frozen-face" /> {goal.consecutiveFlakes} flake{goal.consecutiveFlakes > 1 ? 's' : ''} in a row</Pill>}
      </div>

      {mine ? (
        <div className="space-y-3">
          <Button href={cta.off ? undefined : `/goals/${goal.id}/checkin`} disabled={cta.off} variant={cta.off ? 'secondary' : 'primary'}>{cta.label}</Button>
          {DEMO && <Button variant="danger" onClick={flake} loading={busy}><Icon name="money-wings" /> Flake now (demo)</Button>}
        </div>
      ) : <p className="text-center font-bold text-ink-soft">You are viewing a friend&apos;s goal.</p>}

      <div className="rounded-2xl border-2 border-surface-line overflow-hidden"><Map value={{ lat: goal.lat, lng: goal.lng }} radiusM={goal.radiusM} readOnly /></div>

      <section aria-labelledby="hist">
        <h2 id="hist" className="font-display font-black text-xl mb-2">History</h2>
        {history.length === 0 ? <EmptyState title="Nothing yet" line="Your first check-in or flake will show up here." mood="sleepy" /> : (
          <ul className="space-y-2">
            {history.map((h, i) => (
              <li key={`${h.date}-${i}`} className={`flex items-center justify-between rounded-xl border-2 px-3 py-2.5 ${h.kind === 'ok' ? 'border-leaf/30 bg-leaf-light/50' : 'border-ember/30 bg-ember-light/50'}`}>
                <span className="font-extrabold"><Icon name={h.kind === 'ok' ? 'check' : 'money-wings'} /> {h.text}</span>
                <span className="text-sm font-bold text-ink-soft">{h.date}{h.cents > 0 && <b className="text-ember ml-2 tabular">-{formatCents(h.cents)}</b>}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Inner() {
  const { id } = useParams<{ id: string }>();
  const goal = useGoal(id);
  if (!goal) {
    return (
      <div className="py-10 text-center">
        <div className="flex justify-center"><Flakey mood="sleepy" size={110} /></div>
        <h1 className="font-display font-black text-2xl mt-2">Goal not found</h1>
        <p className="text-ink-soft font-bold mb-4">Maybe it melted.</p>
        <Button href="/home">Back home</Button>
      </div>
    );
  }
  return <Detail goal={goal} />;
}

export default function Page() {
  return <AppShell><Inner /></AppShell>;
}
