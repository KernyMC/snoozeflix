'use client';
import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Wordmark } from './AppShell';
import { inputCls } from './ui/Field';
import { Flakey, type Mood } from './ui/Flakey';

export const AVATARS = ['🦊', '🐼', '🐸', '🦄', '🐙', '🚀', '🍕', '🎧', '🏀', '🌮', '🐧', '🦖'];

export function AuthShell({ title, subtitle, mood = 'happy', children }: { title: string; subtitle?: string; mood?: Mood; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-md min-h-dvh px-5 py-8">
      <div className="text-center mb-5">
        <div className="flex justify-center"><Flakey mood={mood} size={96} /></div>
        <p className="text-3xl mt-1"><Wordmark /></p>
        <h1 className="font-display font-black text-3xl mt-3">{title}</h1>
        {subtitle && <p className="text-ink-soft font-bold mt-1">{subtitle}</p>}
      </div>
      {process.env.NEXT_PUBLIC_DEMO === 'true' && (
        <p className="mb-4 rounded-xl bg-sun-light border-2 border-sun/50 px-3 py-2 text-sm font-bold text-sun-dark" role="note">
          Demo mode: accounts live only in this browser and passwords are not checked yet. Any password of 8+ characters works.
        </p>
      )}
      {children}
    </main>
  );
}

export function PasswordField({ label = 'Password', value, onChange, error, autoComplete }: {
  label?: string; value: string; onChange: (v: string) => void; error?: string | null; autoComplete: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label htmlFor="pw" className="block text-xs font-extrabold uppercase tracking-wide text-ink-soft mb-1.5">{label}</label>
      <div className="relative">
        <input id="pw" type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete}
          maxLength={72} aria-invalid={!!error || undefined} aria-describedby={error ? 'pw-e' : undefined}
          className={`${inputCls} pr-12 ${error ? 'border-ember bg-ember-light' : ''}`} />
        <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show}
          className="absolute right-1 top-1/2 -translate-y-1/2 size-11 grid place-items-center text-ink-soft">
          {show ? <EyeOff size={20} /> : <Eye size={20} />}
        </button>
      </div>
      {error && <p id="pw-e" role="alert" className="text-sm text-ember-dark font-extrabold mt-1">{error}</p>}
    </div>
  );
}
