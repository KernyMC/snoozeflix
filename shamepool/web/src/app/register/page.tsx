'use client';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  registerAccount, SECURITY_QUESTIONS, useMe, validateConfirm, validateEmail, validateFirstName, validateLastName, validatePassword,
  validateUsername, normalizeAnswer, type ErrorCode,
} from '@/data';
import { AuthShell, focusFirstInvalid } from '@/components/auth/AuthShell';
import { PasswordField } from '@/components/auth/PasswordField';
import { cleanCode, withJoin } from '@/components/InviteQr';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field, inputCls } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { errorText } from '@/components/ui/States';

interface Form { firstName: string; lastName: string; email: string; username: string; password: string; confirm: string }
const EMPTY: Form = { firstName: '', lastName: '', email: '', username: '', password: '', confirm: '' };

function validate(f: Form, qs: string[], ans: string[]): Record<string, string> {
  const e: Record<string, string> = {};
  const set = (k: string, c: ErrorCode | null) => { if (c) e[k] = errorText(c); };
  set('firstName', validateFirstName(f.firstName));
  set('lastName', validateLastName(f.lastName));
  set('email', validateEmail(f.email));
  set('username', validateUsername(f.username));
  set('password', validatePassword(f.password));
  if (!e.password) set('confirm', validateConfirm(f.password, f.confirm));
  else if (!f.confirm) e.confirm = 'Re-enter your password.';
  qs.forEach((q, i) => {
    if (!q) e[`q${i}`] = 'Choose a question.';
    const n = normalizeAnswer(ans[i]).length;
    if (n < 2 || n > 50) e[`a${i}`] = 'Answer must be 2–50 characters.';
  });
  return e;
}

export default function RegisterPage() {
  const me = useMe();
  const router = useRouter();
  const [f, setF] = useState<Form>(EMPTY);
  // Optional. Screen-level only: the code is handed to the join step that follows sign-up, which does the joining.
  const [code, setCode] = useState('');
  const [qs, setQs] = useState(['', '', '']);
  const [ans, setAns] = useState(['', '', '']);
  const [err, setErr] = useState<Record<string, string>>({});
  const [formErr, setFormErr] = useState('');
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => { if (me) router.replace(me.squadId ? '/home' : withJoin('/onboarding', code)); }, [me, router, code]);

  const upd = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) => setF((p) => ({ ...p, [k]: e.target.value }));
  /** Validate one field when the user leaves it, so errors appear early but not while typing. */
  const blur = (k: string) => () => {
    const all = validate(f, qs, ans);
    setErr((p) => {
      const n = { ...p };
      if (all[k]) n[k] = all[k]; else delete n[k];
      return n;
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setFormErr('');
    const v = validate(f, qs, ans);
    setErr(v);
    if (Object.keys(v).length) return focusFirstInvalid(formRef.current);
    setBusy(true);
    const r = await registerAccount({ ...f, security: qs.map((qId, i) => ({ qId, answer: ans[i] })) });
    setBusy(false);
    if (r.ok) return router.replace(withJoin('/onboarding', code));
    const field: Partial<Record<ErrorCode, string>> = { username_taken: 'username', email_taken: 'email' };
    const k = field[r.error];
    if (k) { setErr({ [k]: errorText(r.error) }); focusFirstInvalid(formRef.current); } else setFormErr(errorText(r.error));
  };

  return (
    <AuthShell mood={formErr || Object.keys(err).length ? 'worried' : 'happy'} title="Create your account" subtitle="Takes a minute. Then pick your squad.">
      <form ref={formRef} onSubmit={submit} noValidate className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name" value={f.firstName} onChange={upd('firstName')} onBlur={blur('firstName')} error={err.firstName} maxLength={30}
            placeholder="Jane" autoComplete="given-name" enterKeyHint="next" />
          <Field label="Last name" value={f.lastName} onChange={upd('lastName')} onBlur={blur('lastName')} error={err.lastName} maxLength={30}
            placeholder="Doe" autoComplete="family-name" enterKeyHint="next" />
        </div>
        <Field label="Email address" type="email" inputMode="email" value={f.email} onChange={upd('email')} onBlur={blur('email')} error={err.email}
          maxLength={254} placeholder="jane@example.com" autoComplete="email" autoCapitalize="none" spellCheck={false} enterKeyHint="next" />
        <Field label="Username" value={f.username} onChange={upd('username')} onBlur={blur('username')} error={err.username} maxLength={20}
          placeholder="Choose a username" hint="3–20 letters, numbers or underscores. This is your display name."
          autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="next" />
        <PasswordField showStrength label="Password" value={f.password} onChange={upd('password')} onBlur={blur('password')} error={err.password}
          maxLength={72} placeholder="At least 8 characters" hint="Use a letter and a number." autoComplete="new-password" enterKeyHint="next" />
        <PasswordField label="Confirm password" value={f.confirm} onChange={upd('confirm')} onBlur={blur('confirm')} error={err.confirm}
          maxLength={72} placeholder="Re-enter your password" autoComplete="new-password" enterKeyHint="next" />
        <Field label="Invite code (optional)" value={code} onChange={(e) => setCode(cleanCode(e.target.value))} maxLength={8} placeholder="PIZZA6"
          hint="Got a code from your squad? Enter it here. Leave it blank to pick a squad after."
          autoComplete="off" autoCapitalize="characters" autoCorrect="off" spellCheck={false} enterKeyHint="next"
          className="tracking-[0.3em] text-xl font-black uppercase" />

        <div className="pt-2">
          <h2 className="font-display font-black text-xl">Security questions</h2>
          <p className="text-sm font-bold text-ink-soft">You will need these if you forget your password.</p>
        </div>
        {[0, 1, 2].map((i) => (
          <Card key={i} className="space-y-3">
            <p className="text-xs font-black uppercase tracking-wide text-primary">Question {i + 1}</p>
            <div>
              <label htmlFor={`q${i}`} className="block text-xs font-extrabold uppercase tracking-wide text-ink-soft mb-1.5">Select a question</label>
              <Select id={`q${i}`} value={qs[i]} invalid={!!err[`q${i}`]} placeholder="Choose a question…"
                options={SECURITY_QUESTIONS.filter((q) => q.id === qs[i] || !qs.includes(q.id)).map((q) => ({ value: q.id, label: q.text }))}
                onChange={(v) => setQs((p) => p.map((old, j) => (j === i ? v : old)))} onBlur={blur(`q${i}`)}
                className={`${inputCls} ${err[`q${i}`] ? 'border-ember bg-ember-light' : ''}`} />
              {err[`q${i}`] && <p className="text-sm text-ember-dark font-extrabold mt-1" role="alert">{err[`q${i}`]}</p>}
            </div>
            <Field label="Your answer" value={ans[i]} maxLength={50} placeholder="Enter your answer" error={err[`a${i}`]}
              onChange={(e) => setAns((p) => p.map((v, j) => (j === i ? e.target.value : v)))} onBlur={blur(`a${i}`)}
              autoComplete="off" autoCapitalize="none" spellCheck={false} enterKeyHint={i === 2 ? 'go' : 'next'} />
          </Card>
        ))}

        {formErr && <p className="text-sm text-ember-dark font-extrabold text-center" role="alert">{formErr}</p>}
        <Button type="submit" loading={busy}>Create account</Button>
        <Button variant="secondary" href="/"><ArrowLeft aria-hidden size={20} strokeWidth={3} />Back to sign in</Button>
      </form>
    </AuthShell>
  );
}
