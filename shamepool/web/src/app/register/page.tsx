'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { signUp, useMe, validateEmail, validatePassword } from '@/data';
import { AVATARS, AuthShell, PasswordField } from '@/components/AuthShell';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { errorText } from '@/components/ui/States';

function Register() {
  const router = useRouter();
  const params = useSearchParams();
  const join = params.get('join');
  const me = useMe();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [avatar, setAvatar] = useState(AVATARS[0]);
  const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const next = `/onboarding${join ? `?join=${encodeURIComponent(join)}` : ''}`;

  useEffect(() => { if (me) router.replace(me.squadId ? '/home' : next); }, [me, next, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const v: Record<string, string> = {};
    if (name.trim().length < 1 || name.trim().length > 20) v.name = errorText('invalid_name');
    const bad = validateEmail(email);
    if (bad) v.email = 'Enter a valid email.';
    if (validatePassword(password)) v.password = 'Use at least 8 characters.';
    setErrs(v);
    if (Object.keys(v).length) return;
    setBusy(true);
    const r = await signUp({ name, email, password, avatar });
    setBusy(false);
    if (r.ok) return router.replace(next);
    if (r.error === 'email_taken') setErrs({ email: 'That email already has an account. Try signing in.' });
    else if (r.error === 'invalid_email') setErrs({ email: 'Enter a valid email.' });
    else if (r.error === 'weak_password') setErrs({ password: 'Use at least 8 characters.' });
    else if (r.error === 'invalid_name') setErrs({ name: errorText(r.error) });
    else setErrs({ form: errorText(r.error) });
  };

  return (
    <AuthShell title="Create your account" subtitle="Takes 20 seconds. Flaking takes less." mood="cheer">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wide text-ink-soft mb-1.5">Pick an avatar</p>
          <div className="grid grid-cols-6 gap-2" role="radiogroup" aria-label="Avatar">
            {AVATARS.map((a) => (
              <button type="button" key={a} role="radio" aria-checked={avatar === a} aria-label={a} onClick={() => setAvatar(a)}
                className={`aspect-square rounded-xl border-2 text-2xl shadow-chunky-sm ${avatar === a ? 'border-sky bg-sky-light [--edge:var(--color-sky-dark)]' : 'border-surface-line bg-white'}`}>{a}</button>
            ))}
          </div>
        </div>
        <Field label="Your name" value={name} maxLength={20} onChange={(e) => setName(e.target.value)} placeholder="Kevin" autoComplete="nickname" error={errs.name} />
        <Field label="Email" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@school.edu" autoComplete="email" error={errs.email} />
        <PasswordField value={password} onChange={setPassword} error={errs.password} autoComplete="new-password" />
        {errs.form && <p role="alert" className="text-sm text-ember-dark font-extrabold">{errs.form}</p>}
        <Button type="submit" loading={busy}>Create account</Button>
      </form>
      <p className="text-center font-bold text-ink-soft mt-5">
        Already have an account?{' '}
        <Link href={`/login${join ? `?join=${encodeURIComponent(join)}` : ''}`} className="text-primary font-extrabold underline underline-offset-2">Sign in</Link>
      </p>
    </AuthShell>
  );
}

export default function Page() {
  return <Suspense fallback={null}><Register /></Suspense>;
}
