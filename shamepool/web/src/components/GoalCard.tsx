'use client';
import { Flame } from 'lucide-react';
import Link from 'next/link';
import { formatCents, formatCountdown, formatDeadline, nextPenaltyCents, type Goal } from '@/data';
import { DAY_NAMES, useGoalStatus } from './goalStatus';
import { Flakey } from './ui/Flakey';
import { GoalIcon, Icon } from './ui/Icon';
import { Pill } from './ui/Card';

const RIBBON = {
  done: <Pill tone="leaf"><Icon name="check" /> DONE TODAY</Pill>,
  flaked: <Pill tone="ember"><Icon name="money-wings" /> FLAKED</Pill>,
  due: <Pill tone="sky"><Icon name="clock" /> DUE TODAY</Pill>,
  late: <Pill tone="ember"><Icon name="hourglass" /> TIME&apos;S UP</Pill>,
  rest: <Pill tone="gray"><Icon name="sleep" /> REST DAY</Pill>,
};

export function GoalCard({ goal }: { goal: Goal }) {
  const { state, msLeft, urgent } = useGoalStatus(goal);
  const tone = state === 'flaked' || state === 'late' ? 'border-ember/40 bg-ember-light/50' : state === 'done' ? 'border-leaf/40 bg-leaf-light/50' : 'border-surface-line bg-white';
  return (
    <Link href={`/goals/${goal.id}`} aria-label={`${goal.title}, ${state}`}
      className={`block border-2 rounded-2xl p-4 shadow-chunky-sm [--edge:var(--color-surface-line)] active:translate-y-[2px] active:shadow-none transition-transform duration-75 ${tone}`}>
      <div className="flex items-start gap-3">
        <div className="size-14 rounded-2xl bg-sky-light grid place-items-center text-3xl shrink-0"><GoalIcon value={goal.emoji} size={36} /></div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-display font-black text-lg leading-tight truncate">{goal.title}</h3>
            <div className="shrink-0">{RIBBON[state]}</div>
          </div>
          <div className="flex flex-wrap gap-1 mt-1.5">
            {DAY_NAMES.map((d, i) => goal.daysOfWeek.includes(i) && <span key={d} className="rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-extrabold text-ink-soft">{d}</span>)}
          </div>
          <div className="flex items-center justify-between mt-2.5 gap-2">
            <p className={`text-sm font-extrabold flex items-center gap-1.5 ${urgent || state === 'late' ? 'text-ember' : 'text-ink-soft'}`}>
              {urgent && <Flakey mood="worried" size={22} />}
              {state === 'due' || state === 'late' ? `${state === 'late' ? '' : 'Due in '}${formatCountdown(msLeft)}` : `Deadline ${formatDeadline(goal.deadlineMinutes)}`}
            </p>
            <div className="flex items-center gap-2 text-sm font-black">
              <span className={`flex items-center gap-0.5 ${goal.streak > 0 ? 'text-flame' : 'text-ink-faint'}`}><Flame size={18} strokeWidth={2.5} fill="currentColor" aria-hidden />{goal.streak}</span>
              <span className="text-ember tabular" title="Next miss">-{formatCents(nextPenaltyCents(goal))}</span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
