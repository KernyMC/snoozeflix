'use client';
import { useEffect, useState } from 'react';
import { Wrench, X } from 'lucide-react';
import { demoExpirePoolDeadline, forceFlake, localMinutes, resetDemoData, setDemoFlags, useDemoFlags, useMe, useMyGoals, useSquad } from '@/data';
import { DEMO_ENABLED } from '@/lib/demo';
import { useToast } from './ui/Toast';
import { Select } from './ui/Select';
import { Icon, isIconName } from './ui/Icon';
import { errorText } from './ui/States';

const DEMO = DEMO_ENABLED;
const DEMO_TZ = 'America/Detroit';

export function DemoPanel() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const me = useMe();
  const [projector, setProjector] = useState(false);
  useEffect(() => { setProjector(window.location.search.includes('tv=1')); }, []);
  const goals = useMyGoals();
  const squad = useSquad();
  const flags = useDemoFlags();
  const { toast } = useToast();
  const [goalId, setGoalId] = useState('');
  if (!DEMO || !me || projector) return null; // visible for every signed-in account
  const goal = goals.find((g) => g.id === (goalId || goals[0]?.id));
  const tz = squad?.timezone ?? DEMO_TZ;

  /** Runs a demo action; a failed Result (e.g. `not_available` on the shared live server) shows its error instead. */
  const run = async (label: string, fn: () => Promise<unknown>): Promise<boolean> => {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    const res = r as { ok?: boolean; error?: string } | null | undefined;
    const failed = res?.ok === false;
    if (failed) toast(errorText(res?.error ?? 'unknown'), 'error');
    else toast(label, 'info');
    return !failed;
  };
  const btn = 'w-full rounded-xl border-2 border-surface-line bg-white px-3 py-2.5 text-left text-sm font-extrabold active:bg-surface-muted disabled:opacity-50';

  return (
    <div className="fixed left-3 bottom-24 z-[55] print:hidden">
      {open ? (
        <div className="w-72 rounded-2xl border-2 border-grape bg-white p-3 shadow-chunky [--edge:var(--color-grape-dark)] space-y-2" role="region" aria-label="Demo controls">
          <div className="flex items-center justify-between">
            <strong className="font-display font-black text-grape-dark">Demo controls</strong>
            <button onClick={() => setOpen(false)} aria-label="Close demo controls" className="p-2 -m-2"><X size={20} /></button>
          </div>
          {goals.length > 0 ? (
            <Select value={goal?.id ?? ''} onChange={setGoalId} aria-label="Goal"
              options={goals.map((g) => ({ value: g.id, label: isIconName(g.emoji) ? g.title : `${g.emoji} ${g.title}` }))}
              className="w-full rounded-xl border-2 border-surface-line bg-surface-muted px-3 py-2 font-bold outline-none focus:border-sky" />
          ) : <p className="text-sm text-ink-soft font-bold">Create a goal to use these.</p>}
          <button className={btn} disabled={busy || !goal} onClick={() => goal && run('Flaked', () => forceFlake(goal.id))}><Icon name="money-wings" /> Flake now</button>
          <button className={btn} disabled={busy || !goal} onClick={() => goal && run(
            flags.fakeLocation ? 'Location is real again' : 'Pretending you are there',
            () => setDemoFlags({ fakeLocation: flags.fakeLocation ? null : { lat: goal.lat, lng: goal.lng, accuracyM: 5 } }),
          )}><Icon name="pin" /> Pretend I&apos;m there: <b>{flags.fakeLocation ? 'ON' : 'off'}</b></button>
          <button className={btn} onClick={() => run(flags.nextPhotoFails ? 'Photos pass again' : 'The next photo will fail', () => setDemoFlags({ nextPhotoFails: !flags.nextPhotoFails }))}>
            <Icon name="camera" /> Next photo fails: <b>{flags.nextPhotoFails ? 'ON' : 'off'}</b>
          </button>
          <button className={btn} disabled={!goal} onClick={() => goal && run('Jumped to 1 min before deadline', () =>
            setDemoFlags({ timeOffsetMs: flags.timeOffsetMs + (goal.deadlineMinutes - 1 - localMinutes(Date.now() + flags.timeOffsetMs, tz)) * 60_000 }))}>
            <Icon name="clock" /> Skip to 1 min before deadline
          </button>
          <button className={btn} disabled={busy || !squad || squad.poolBalanceCents < squad.poolGoalCents}
            onClick={() => run('Pool deadline skipped', () => demoExpirePoolDeadline())}>
            <Icon name="hourglass" /> Skip pool deadline (charity)
          </button>
          <button className={btn} disabled={flags.timeOffsetMs === 0} onClick={() => run('Clock reset', () => setDemoFlags({ timeOffsetMs: 0 }))}><Icon name="undo" /> Reset clock</button>
          <button className={`${btn} text-ember-dark`} disabled={busy}
            onClick={async () => { if (await run('Demo data reset', () => resetDemoData())) window.location.href = '/'; }}><Icon name="trash" /> Reset demo data</button>
        </div>
      ) : (
        <button onClick={() => setOpen(true)} aria-label="Open demo controls"
          className="size-12 rounded-full bg-grape text-white grid place-items-center shadow-chunky [--edge:var(--color-grape-dark)] active:translate-y-1 active:shadow-none">
          <Wrench size={22} strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
}
