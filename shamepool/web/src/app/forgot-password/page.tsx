'use client';
import { ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import {
  getSecurityQuestions, resetPassword, validateConfirm, validatePassword, verifySecurityAnswers, type ErrorCode,
} from '@/data';
import { AuthShell, focusFirstInvalid } from '@/components/auth/AuthShell';
import { PasswordField } from '@/components/auth/PasswordField';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { errorText } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';

const STEPS = ['Find account', 'Verify', 'New password'];

export default function ForgotPasswordPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [username, setUsername] = useState('');
  const [questions, setQuestions] = useState<string[]>([]);
  const [answers, setAnswers] = useState(['', '', '']);
  const [token, setToken] = useState('');
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState<Record<string, string>>({});
  const [formErr, setFormErr] = useState('');
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const startOver = () => {
    setStep(1); setAnswers(['', '', '']); setToken(''); setPw(''); setConfirm(''); setErr({}); setFormErr('');
  };
  const fail = (code: ErrorCode, field?: string) => {
    if (code === 'invalid_reset') { startOver(); return setFormErr(errorText(code)); }
    if (field) { setErr({ [field]: errorText(code) }); focusFirstInvalid(formRef.current); } else setFormErr(errorText(code));
  };

  const findAccount = async () => {
    if (!username.trim()) { setErr({ username: 'Enter your username.' }); return focusFirstInvalid(formRef.current); }
    setBusy(true);
    const r = await getSecurityQuestions(username);
    setBusy(false);
    if (!r.ok) return fail(r.error, r.error === 'account_not_found' ? 'username' : undefined);
    setQuestions(r.data);
    setStep(2);
  };

  const verify = async () => {
    const e: Record<string, string> = {};
    answers.forEach((a, i) => { if (!a.trim()) e[`a${i}`] = 'Enter your answer.'; });
    setErr(e);
    if (Object.keys(e).length) return focusFirstInvalid(formRef.current);
    setBusy(true);
    const r = await verifySecurityAnswers(username, answers);
    setBusy(false);
    if (!r.ok) return fail(r.error);
    setToken(r.data);
    setStep(3);
  };

  const reset = async () => {
    const e: Record<string, string> = {};
    const p = validatePassword(pw);
    if (p) e.pw = errorText(p);
    const c = validateConfirm(pw, confirm);
    if (!p && c) e.confirm = errorText(c);
    setErr(e);
    if (Object.keys(e).length) return focusFirstInvalid(formRef.current);
    setBusy(true);
    const r = await resetPassword(username, token, pw, confirm);
    setBusy(false);
    if (!r.ok) return fail(r.error);
    toast('Password updated. Sign in!', 'success');
    router.replace('/');
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setFormErr('');
    if (step === 1) findAccount(); else if (step === 2) verify(); else reset();
  };

  const copy = [
    { title: 'Reset your password', sub: 'Enter your username to find your account' },
    { title: 'Verify it is you', sub: 'Answer your 3 security questions' },
    { title: 'New password', sub: 'Pick something you will remember' },
  ][step - 1];

  return (
    <AuthShell mood={formErr || Object.keys(err).length ? 'worried' : step === 3 ? 'cheer' : 'happy'} title={copy.title} subtitle={copy.sub}
      step={{ current: step, labels: STEPS }}>
      <form ref={formRef} onSubmit={submit} noValidate className="space-y-4">
        {step === 1 && (
          <Field label="Username" value={username} onChange={(e) => setUsername(e.target.value)} error={err.username}
            placeholder="Enter your username" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="go" />
        )}
        {step === 2 && questions.map((q, i) => (
          <Card key={i}>
            <Field label={q} value={answers[i]} maxLength={50} placeholder="Enter your answer" error={err[`a${i}`]}
              onChange={(e) => setAnswers((p) => p.map((v, j) => (j === i ? e.target.value : v)))}
              autoComplete="off" autoCapitalize="none" spellCheck={false} enterKeyHint={i === 2 ? 'go' : 'next'} />
          </Card>
        ))}
        {step === 3 && (
          <>
            <PasswordField showStrength label="New password" value={pw} onChange={(e) => setPw(e.target.value)} error={err.pw}
              maxLength={72} placeholder="At least 8 characters" hint="Use a letter and a number." autoComplete="new-password" enterKeyHint="next" />
            <PasswordField label="Confirm password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={err.confirm}
              maxLength={72} placeholder="Re-enter your password" autoComplete="new-password" enterKeyHint="go" />
          </>
        )}
        {formErr && <p className="text-sm text-ember-dark font-extrabold text-center" role="alert">{formErr}</p>}
        <Button type="submit" loading={busy}>{step === 1 ? <>Continue<ArrowRight aria-hidden size={20} strokeWidth={3} /></> : step === 2 ? 'Verify' : 'Reset password'}</Button>
        <div className="border-t-2 border-surface-line" />
        {step === 1 ? (
          <Button variant="secondary" href="/">Back to sign in</Button>
        ) : (
          <Button variant="secondary" type="button" onClick={startOver}>Start over</Button>
        )}
      </form>
    </AuthShell>
  );
}
