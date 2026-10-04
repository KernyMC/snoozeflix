'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { signIn, useMe, validateEmail } from '@/data';
import { AuthShell, PasswordField } from '@/components/AuthShell';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { errorText } from '@/components/ui/States';

function Login() {
  const router = useRouter();
  const params = useSearchParams();
  const join = params.get('join');
  const me = useMe();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const q = join ? `?join=${encodeURIComponent(join)}` : '';

  useEffect(() => { if (me) router.replace(me.squadId ? '/home' : `/onboarding${q}`); }, [me, q, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const v: Record<string, string> = {};
    if (validateEmail(email)) v.email = 'Enter a valid email.';
    if (password.length < 8) v.password = 'Use at least 8 characters.';
    setErrs(v);
    if (Object.keys(v).length) return;
    setBusy(true);
    const r = await signIn({ email, password });
    setBusy(false);
    if (r.ok) return router.replace(r.data.squadId ? '/home' : `/onboarding${q}`);
    if (r.error === 'no_account') setErrs({ email: 'No account with that email. Create one?' });
    else setErrs({ form: errorText(r.error) });
  };

  return (
    <AuthShell title="Welcome back" subtitle="Your friends kept the pool warm." mood="happy">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Email" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@school.edu" autoComplete="email" error={errs.email} />
        <PasswordField value={password} onChange={setPassword} error={errs.password} autoComplete="current-password" />
        {errs.form && <p role="alert" className="text-sm text-ember-dark font-extrabold">{errs.form}</p>}
        <Button type="submit" loading={busy}>Sign in</Button>
      </form>
      <p className="text-center font-bold text-ink-soft mt-5">
        New here?{' '}
        <Link href={`/register${q}`} className="text-primary font-extrabold underline underline-offset-2">Create an account</Link>
      </p>
      {process.env.NEXT_PUBLIC_DEMO === 'true' && (
        <p className="text-center text-sm font-bold text-ink-faint mt-3">Demo accounts: kevin@demo.test, ana@demo.test, leo@demo.test, maya@demo.test</p>
      )}
    </AuthShell>
  );
}

export default function Page() {
  return <Suspense fallback={null}><Login /></Suspense>;
}
