'use client';
import { Flakey, type Mood } from './Flakey';
import { Button } from './Button';

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden />;
}

export function ListSkeleton({ rows = 3, h = 'h-24' }: { rows?: number; h?: string }) {
  return (
    <div className="space-y-3" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className={`${h} w-full`} />)}
    </div>
  );
}

export function EmptyState({ title, line, mood = 'sleepy', cta, href, onClick }: {
  title: string; line?: string; mood?: Mood; cta?: string; href?: string; onClick?: () => void;
}) {
  return (
    <div className="flex flex-col items-center text-center gap-2 py-8 px-4">
      <Flakey mood={mood} size={120} />
      <h2 className="font-display font-black text-2xl mt-2">{title}</h2>
      {line && <p className="text-ink-soft font-bold max-w-xs">{line}</p>}
      {cta && <div className="w-full max-w-xs mt-4"><Button href={href} onClick={onClick}>{cta}</Button></div>}
    </div>
  );
}

export function ErrorState({ title = 'Something melted', line = 'That did not work. Try again?', onRetry }: { title?: string; line?: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center text-center gap-2 py-8 px-4" role="alert">
      <Flakey mood="melting" size={110} />
      <h2 className="font-display font-black text-2xl mt-2">{title}</h2>
      <p className="text-ink-soft font-bold max-w-xs">{line}</p>
      {onRetry && <div className="w-full max-w-xs mt-4"><Button variant="secondary" onClick={onRetry}>Retry</Button></div>}
    </div>
  );
}

export const ERROR_COPY: Record<string, string> = {
  invalid_name: 'Pick a name (1–20 characters).',
  invalid_code: 'That invite code does not exist.',
  already_in_squad: 'You are already in a squad.',
  squad_full: 'That squad is full (8 max).',
  invalid_amount: 'Pick an amount between $0.01 and $1,000.',
  invalid_title: 'Give it a title (max 40 characters).',
  no_days: 'Pick at least one day.',
  invalid_radius: 'Radius must be 50–1000 m.',
  invalid_penalty: 'Penalty must be at least $1 and no more than the cap.',
  invalid_location: 'We need a valid location.',
  invalid_stay: 'Stay time must be 1–180 minutes.',
  too_many_goals: 'Max 5 active goals. Finish one first.',
  not_due_today: 'This goal is not due today.',
  deadline_passed: 'The deadline already passed.',
  already_done: 'Already done today. Nice.',
  already_flaked: 'Already flaked today. Tomorrow is a new day.',
  left_area: 'You left the area. Check-in failed.',
  too_early: 'Too early. Keep staying there.',
  too_many_attempts: 'Too many tries. Check-in failed.',
  invalid_photo: 'That does not look like a photo.',
  invalid_message: 'Messages must be 1–280 characters.',
  rate_limited: 'Slow down. Five messages per ten seconds.',
  action_expired: 'That action expired. Ask again.',
  action_not_found: 'That action is gone.',
  pool_not_ready: 'The pool is not full yet.',
  proposal_open: 'There is already an open proposal.',
  pool_changed: 'The pool changed. Try again.',
  not_your_goal: 'That goal belongs to someone else.',
  mock_error: 'Simulated error (mockError=1).',
  offline: 'You are offline.',
};
export const errorText = (code: string) => ERROR_COPY[code] ?? 'Something went wrong. Try again.';
