'use client';
import { useId, useState } from 'react';
import type { InputHTMLAttributes } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { inputCls } from '@/components/ui/Field';
import { passwordStrength } from '@/data';

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
  error?: string | null;
  hint?: string;
  showStrength?: boolean;
}

const STRENGTH = ['', 'Weak', 'Okay', 'Good', 'Strong'];
const STRENGTH_BG = ['bg-surface-line', 'bg-ember', 'bg-sun', 'bg-sky', 'bg-leaf'];

export function PasswordField({ label, error, hint, showStrength, className = '', value, ...rest }: Props) {
  const id = useId();
  const [shown, setShown] = useState(false);
  const level = passwordStrength(String(value ?? ''));
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-extrabold uppercase tracking-wide text-ink-soft mb-1.5">{label}</label>
      <div className="relative">
        <input id={id} {...rest} value={value} type={shown ? 'text' : 'password'} aria-invalid={!!error || undefined}
          aria-describedby={error ? `${id}-e` : undefined}
          className={`${inputCls} pr-12 ${error ? 'border-ember bg-ember-light' : ''} ${className}`} />
        <button type="button" onClick={() => setShown((s) => !s)} aria-label={shown ? 'Hide password' : 'Show password'} aria-pressed={shown}
          className="absolute right-0 top-0 h-full w-12 grid place-items-center text-ink-soft">
          {shown ? <EyeOff size={20} strokeWidth={2.5} /> : <Eye size={20} strokeWidth={2.5} />}
        </button>
      </div>
      {showStrength && level > 0 && (
        <div className="mt-2" aria-live="polite">
          <div className="flex gap-1.5">
            {[1, 2, 3, 4].map((n) => <span key={n} className={`h-1.5 flex-1 rounded-full ${n <= level ? STRENGTH_BG[level] : 'bg-surface-line'}`} />)}
          </div>
          <p className="text-xs font-extrabold text-ink-soft mt-1">{STRENGTH[level]}</p>
        </div>
      )}
      {hint && !error && <p className="text-xs text-ink-faint font-bold mt-1">{hint}</p>}
      {error && <p id={`${id}-e`} className="text-sm text-ember-dark font-extrabold mt-1" role="alert">{error}</p>}
    </div>
  );
}
