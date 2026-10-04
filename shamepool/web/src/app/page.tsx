'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { login, useMe } from '@/data';
import { AuthShell, focusFirstInvalid } from '@/components/auth/AuthShell';
import { afterAuth, joinParam, withJoin } from '@/components/InviteQr';
import { PasswordField } from '@/components/auth/PasswordField';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { errorText } from '@/components/ui/States';


function LoginPage() {
  const me = useMe();
  const router = useRouter();
  const params = useSearchParams();
  const join = joinParam(params); // invite code from a scanned QR, if any
  const snap = params.get('s');
  const onboarding = afterAuth(join, snap); // with an invite: back to the join card, which joins in one tap
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<Record<string, string>>({});
  const [formErr, setFormErr] = useState('');
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => { if (me) router.replace(me.squadId && !join ? '/home' : onboarding); }, [me, router, onboarding, join]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setFormErr('');
    const next: Record<string, string> = {};
    if (!username.trim()) next.username = 'Enter your username.';
    if (!password) next.password = 'Enter your password.';
    setErr(next);
    if (Object.keys(next).length) return focusFirstInvalid(formRef.current);
    setBusy(true);
    const r = await login(username, password);
    setBusy(false);
    if (!r.ok) return setFormErr(errorText(r.error));
    router.replace(r.data.squadId && !join ? '/home' : onboarding);
  };

  return (
    <AuthShell big mood={formErr ? 'worried' : 'cheer'} title="Welcome back" subtitle="Sign in to your account">
      <form ref={formRef} onSubmit={submit} noValidate className="space-y-4">
        <Field label="Username" value={username} onChange={(e) => setUsername(e.target.value)} error={err.username}
          placeholder="Enter your username" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="next" />
        <PasswordField label="Password" value={password} onChange={(e) => setPassword(e.target.value)} error={err.password}
          placeholder="Enter your password" autoComplete="current-password" enterKeyHint="go" />
        {formErr && <p className="text-sm text-ember-dark font-extrabold text-center" role="alert">{formErr}</p>}
        <Button type="submit" loading={busy}>Sign in</Button>
      </form>
      <div className="border-t-2 border-surface-line my-5" />
      <div className="space-y-3">
        <Button variant="secondary" href={withJoin('/register', join, snap)}>Create an account</Button>
        <Button variant="ghost" href="/forgot-password">Forgot password?</Button>
      </div>

    </AuthShell>
  );
}

export default function Page() {
  return <Suspense fallback={null}><LoginPage /></Suspense>;
}
