'use client';
import type { ReactNode } from 'react';
import { Wordmark } from '@/components/AppShell';
import { Flakey } from '@/components/ui/Flakey';

type Mood = 'happy' | 'cheer' | 'worried' | 'melting' | 'smug' | 'sleepy';

/** After a failed submit, move focus to the first invalid field once React has rendered the errors. */
export function focusFirstInvalid(form: HTMLElement | null): void {
  setTimeout(() => form?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 0);
}

export function AuthShell({ title, subtitle, mood = 'happy', big, step, children }: {
  title: string; subtitle?: string; mood?: Mood; big?: boolean; step?: { current: number; labels: string[] }; children: ReactNode;
}) {
  return (
    <main className="mx-auto max-w-md min-h-dvh px-5 pt-6 pb-[max(2rem,env(safe-area-inset-bottom))] flex flex-col">
      {step && (
        <ol className="flex items-start justify-between mb-4" aria-label={`Step ${step.current} of ${step.labels.length}`}>
          {step.labels.map((l, i) => (
            <li key={l} className="flex-1 flex flex-col items-center gap-1" aria-current={i + 1 === step.current ? 'step' : undefined}>
              <span className={`size-8 rounded-full grid place-items-center font-black text-sm ${i + 1 <= step.current ? 'bg-sky text-ink' : 'bg-surface-line text-ink-soft'}`}>{i + 1}</span>
              <span className={`text-[11px] font-extrabold uppercase tracking-wide ${i + 1 === step.current ? 'text-ink' : 'text-ink-faint'}`}>{l}</span>
            </li>
          ))}
        </ol>
      )}
      <header className="flex flex-col items-center text-center gap-2 mb-5">
        <Flakey mood={mood} size={big ? 140 : 96} />
        {big ? <p className="text-5xl"><Wordmark /></p> : <Wordmark className="text-2xl" />}
        {big && <p className="font-display font-extrabold text-lg text-ink-soft max-w-[18rem]">Skip the task. Loose the cash.</p>}
        <h1 className="font-display font-black text-3xl mt-1">{title}</h1>
        {subtitle && <p className="font-bold text-ink-soft">{subtitle}</p>}
      </header>
      {children}
    </main>
  );
}
