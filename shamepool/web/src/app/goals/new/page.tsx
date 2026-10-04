'use client';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createGoal, useMyGoals } from '@/data';
import { AppShell } from '@/components/AppShell';
import { DayChips, EscalationPreview, PenaltyStepper } from '@/components/GoalFormParts';
import { LocationPicker } from '@/components/LocationPicker';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { GOAL_ICONS, Icon } from '@/components/ui/Icon';
import { errorText } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';

const DEMO = process.env.NEXT_PUBLIC_DEMO === 'true';
const STAYS = DEMO ? [1, 5, 15, 30, 60] : [15, 30, 45, 60, 90];
const CAP = 4000;

function NewGoal() {
  const router = useRouter();
  const { toast } = useToast();
  const goals = useMyGoals();
  const [title, setTitle] = useState('');
  const [emoji, setEmoji] = useState<string>(GOAL_ICONS[0]);
  const [pos, setPos] = useState({ lat: 42.2766, lng: -83.7382 });
  const [radius, setRadius] = useState(DEMO ? 150 : 100);
  const [days, setDays] = useState<number[]>([1, 3, 5]);
  const [time, setTime] = useState('18:00');
  const [stay, setStay] = useState(DEMO ? 1 : 30);
  const [base, setBase] = useState(500);
  const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const full = goals.length >= 5;

  const submit = async () => {
    const [h, m] = time.split(':').map(Number);
    const e: Record<string, string> = {};
    if (title.trim().length < 1 || title.trim().length > 40) e.title = errorText('invalid_title');
    if (days.length === 0) e.days = errorText('no_days');
    if (!Number.isFinite(h)) e.time = 'Pick a deadline time.';
    setErrs(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    const r = await createGoal({
      title, emoji, lat: pos.lat, lng: pos.lng, radiusM: radius, daysOfWeek: days, deadlineMinutes: h * 60 + m,
      minStayMinutes: stay, basePenaltyCents: base, maxPenaltyCents: CAP,
    });
    setBusy(false);
    if (!r.ok) return toast(errorText(r.error), 'error');
    toast('Committed. No take-backs', 'success');
    router.replace(`/goals/${r.data.id}`);
  };

  const label = 'text-xs font-extrabold uppercase tracking-wide text-ink-soft mb-1.5';
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <button onClick={() => router.back()} aria-label="Back" className="size-11 -ml-2 grid place-items-center"><ArrowLeft strokeWidth={3} /></button>
        <h1 className="font-display font-black text-3xl">New commitment</h1>
      </div>
      {full && <p role="alert" className="rounded-xl bg-flame-light p-3 font-extrabold text-flame-dark">You already have 5 active goals. That is the max.</p>}

      <div>
        <p className={label}>What</p>
        <div className="flex gap-2 mb-3" role="radiogroup" aria-label="Icon">
          {GOAL_ICONS.map((x) => (
            <button key={x} type="button" role="radio" aria-checked={emoji === x} aria-label={x.replace('goal-', '')} onClick={() => setEmoji(x)}
              className={`flex-1 aspect-square rounded-xl border-2 text-2xl shadow-chunky-sm ${emoji === x ? 'border-sky bg-sky-light [--edge:var(--color-sky-dark)]' : 'border-surface-line'}`}><Icon name={x} size={30} /></button>
          ))}
        </div>
        <Field label="Title" value={title} maxLength={40} onChange={(e) => setTitle(e.target.value)} placeholder="Gym" error={errs.title} />
      </div>

      <div>
        <p className={label}>Where</p>
        <LocationPicker value={pos} radiusM={radius} onChange={setPos} />
        <div className="mt-3">
          <label htmlFor="radius" className={`${label} block`}>Radius: {radius} m</label>
          <input id="radius" type="range" min={50} max={1000} step={10} value={radius} onChange={(e) => setRadius(+e.target.value)} className="w-full accent-sky h-8" />
        </div>
      </div>

      <div>
        <p className={label}>When</p>
        <DayChips value={days} onChange={setDays} />
        {errs.days && <p role="alert" className="text-sm text-ember-dark font-extrabold mt-1">{errs.days}</p>}
        <div className="mt-3"><Field label="Deadline" type="time" value={time} onChange={(e) => setTime(e.target.value)} error={errs.time} /></div>
        <p className={`${label} mt-3`}>Minimum stay</p>
        <div className="flex gap-2" role="radiogroup" aria-label="Minimum stay">
          {STAYS.map((s) => (
            <button key={s} type="button" role="radio" aria-checked={stay === s} onClick={() => setStay(s)}
              className={`flex-1 min-h-[48px] rounded-xl border-2 font-display font-black shadow-chunky-sm ${stay === s ? 'border-sky bg-sky-light text-sky-dark [--edge:var(--color-sky-dark)]' : 'border-surface-line text-ink-soft'}`}>{s}m</button>
          ))}
        </div>
      </div>

      <div>
        <p className={label}>The stakes</p>
        <PenaltyStepper cents={base} onChange={setBase} max={CAP} />
        <div className="mt-3"><EscalationPreview base={base} max={CAP} /></div>
      </div>

      <div className="sticky bottom-24 bg-white/90 backdrop-blur py-2">
        <Button onClick={submit} loading={busy} disabled={full}>Commit</Button>
      </div>
    </div>
  );
}

export default function Page() {
  return <AppShell><NewGoal /></AppShell>;
}
