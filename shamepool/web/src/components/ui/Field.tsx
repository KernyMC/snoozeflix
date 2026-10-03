'use client';
import { useId } from 'react';
import type { InputHTMLAttributes } from 'react';

export const inputCls =
  'w-full bg-surface-muted border-2 border-surface-line rounded-xl px-4 py-3 min-h-[48px] font-bold text-ink ' +
  'placeholder:text-ink-faint focus:border-sky focus:bg-white outline-none';

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string | null;
  hint?: string;
}

export function Field({ label, error, hint, className = '', ...rest }: Props) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-extrabold uppercase tracking-wide text-ink-soft mb-1.5">{label}</label>
      <input id={id} {...rest} aria-invalid={!!error || undefined} aria-describedby={error ? `${id}-e` : undefined}
        className={`${inputCls} ${error ? 'border-ember bg-ember-light' : ''} ${className}`} />
      {hint && !error && <p className="text-xs text-ink-faint font-bold mt-1">{hint}</p>}
      {error && <p id={`${id}-e`} className="text-sm text-ember-dark font-extrabold mt-1" role="alert">{error}</p>}
    </div>
  );
}

export function dollarsToCents(v: string): number {
  const n = Math.round(parseFloat(v.replace(/[^0-9.]/g, '')) * 100);
  return Number.isFinite(n) ? n : NaN;
}
