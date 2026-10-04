'use client';
import { ArrowRight, Minus, Plus } from 'lucide-react';
import { formatCents, nextPenaltyCents } from '@/data';
import { InlineIcon } from './ui/IconText';
import { DAY_LABELS, DAY_NAMES } from './goalStatus';

export function DayChips({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  const order = [1, 2, 3, 4, 5, 6, 0];
  const toggle = (d: number) => onChange(value.includes(d) ? value.filter((x) => x !== d) : [...value, d].sort());
  return (
    <div className="flex gap-1.5" role="group" aria-label="Days of the week">
      {order.map((d) => {
        const on = value.includes(d);
        return (
          <button key={d} type="button" onClick={() => toggle(d)} aria-pressed={on} aria-label={DAY_NAMES[d]}
            className={`flex-1 min-h-[48px] rounded-xl border-2 font-display font-black shadow-chunky-sm ${on ? 'border-sky bg-sky-light text-sky-dark [--edge:var(--color-sky-dark)]' : 'border-surface-line bg-white text-ink-faint'}`}>
            {DAY_LABELS[d]}
          </button>
        );
      })}
    </div>
  );
}

export function PenaltyStepper({ cents, onChange, min = 100, max = 4000 }: { cents: number; onChange: (c: number) => void; min?: number; max?: number }) {
  const step = (d: number) => onChange(Math.max(min, Math.min(max, cents + d * 100)));
  const b = 'size-12 rounded-xl border-2 border-surface-line bg-white grid place-items-center shadow-chunky-sm active:translate-y-[2px] active:shadow-none disabled:opacity-40';
  return (
    <div className="flex items-center justify-between gap-3">
      <button type="button" className={b} onClick={() => step(-1)} disabled={cents <= min} aria-label="Lower penalty"><Minus strokeWidth={3} /></button>
      <div className="text-center">
        <div className="font-display font-black text-4xl text-ember tabular" aria-live="polite">{formatCents(cents)}</div>
        <div className="text-xs font-extrabold uppercase tracking-wide text-ink-faint">base penalty</div>
      </div>
      <button type="button" className={b} onClick={() => step(1)} disabled={cents >= max} aria-label="Raise penalty"><Plus strokeWidth={3} /></button>
    </div>
  );
}

export function EscalationPreview({ base, max }: { base: number; max: number }) {
  const rows = [0, 1, 2, 3].map((n) => ({ n, c: nextPenaltyCents({ basePenaltyCents: base, maxPenaltyCents: max, consecutiveFlakes: n }) }));
  return (
    <div className="rounded-2xl bg-ember-light/60 border-2 border-ember/20 p-3">
      <p className="font-extrabold text-ember-dark mb-2">Miss it twice in a row <InlineIcon icon={ArrowRight} /> {formatCents(rows[1].c)}</p>
      <div className="grid grid-cols-4 gap-2 text-center">
        {rows.map((r) => (
          <div key={r.n} className="rounded-xl bg-white py-2 border-2 border-surface-line">
            <div className="text-[11px] font-extrabold text-ink-faint uppercase">{r.n === 0 ? '1st' : r.n === 1 ? '2nd' : r.n === 2 ? '3rd' : '4th+'}</div>
            <div className="font-display font-black text-ember tabular">{formatCents(r.c)}</div>
          </div>
        ))}
      </div>
      <p className="text-xs font-bold text-ink-soft mt-2">Doubles for each flake in a row. Capped at {formatCents(max)}. Finishing a day resets it.</p>
    </div>
  );
}
