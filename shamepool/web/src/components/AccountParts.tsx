'use client';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import type { ErrorCode } from '@/data';
import { focusFirstInvalid } from '@/components/auth/AuthShell';
import { Card } from '@/components/ui/Card';
import { errorText } from '@/components/ui/States';

export type Errs = Record<string, string>;

/** Field errors appear on blur and on submit, never while typing (same behaviour as the register page). */
export function useErrors(validate: () => Errs) {
  const [err, setErr] = useState<Errs>({});
  const [formErr, setFormErr] = useState('');
  const blur = (k: string) => () => {
    const all = validate();
    setErr((p) => {
      const n = { ...p };
      if (all[k]) n[k] = all[k]; else delete n[k];
      return n;
    });
  };
  /** Drop a field's error as soon as it is edited, so the message is not still there (and the layout does not jump) when the user reaches for Save. */
  const clear = (k: string) => setErr((p) => {
    if (!p[k]) return p;
    const n = { ...p };
    delete n[k];
    return n;
  });
  /** Put a rejected action's error on the field it belongs to, or on the form when it has no field. */
  const reject = (code: ErrorCode, fields: Partial<Record<ErrorCode, string>>, form: HTMLFormElement | null) => {
    const k = fields[code];
    if (k) { setErr({ [k]: errorText(code) }); focusFirstInvalid(form); } else setFormErr(errorText(code));
  };
  return { err, setErr, formErr, setFormErr, blur, clear, reject };
}

export const FormError = ({ text }: { text: string }) => (text ? <p className="text-sm text-ember-dark font-extrabold text-center" role="alert">{text}</p> : null);

/** One collapsible section of the Account list. */
export function Row({ id, icon, title, summary, open, onToggle, children }: {
  id: string; icon: ReactNode; title: string; summary: string; open: boolean; onToggle: () => void; children: ReactNode;
}) {
  return (
    <Card className="!p-0">
      <h3>
        <button type="button" id={`acct-${id}-btn`} aria-expanded={open} aria-controls={`acct-${id}-panel`} onClick={onToggle}
          className={`w-full flex items-center gap-3 p-4 min-h-[64px] text-left active:bg-surface-muted ${open ? 'rounded-t-[18px]' : 'rounded-[18px]'}`}>
          <span className="size-10 rounded-xl bg-sky-light text-sky-dark grid place-items-center shrink-0" aria-hidden>{icon}</span>
          <span className="min-w-0 flex-1">
            <span className="block font-display font-black text-lg leading-tight">{title}</span>
            <span className="block text-sm font-bold text-ink-soft truncate">{summary}</span>
          </span>
          <ChevronDown size={22} strokeWidth={3} aria-hidden className={`shrink-0 text-ink-faint transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </h3>
      {open && (
        <div id={`acct-${id}-panel`} role="region" aria-labelledby={`acct-${id}-btn`} className="border-t-2 border-surface-line p-4">{children}</div>
      )}
    </Card>
  );
}
