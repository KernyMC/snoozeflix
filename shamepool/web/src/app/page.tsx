'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { claimSeedUser, listSeedUsers, login, useMe, type User } from '@/data';
import { AuthShell, focusFirstInvalid } from '@/components/auth/AuthShell';
import { joinParam, withJoin } from '@/components/InviteQr';
import { PasswordField } from '@/components/auth/PasswordField';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { errorText } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';

const DEMO = process.env.NEXT_PUBLIC_DEMO === 'true';
const DEV_SKIP = process.env.NODE_ENV !== 'production'; // dev-only bypass, stripped from production builds

function LoginPage() {
  const me = useMe();
  const router = useRouter();
  const join = joinParam(useSearchParams()); // invite code from a scanned QR, if any
  const onboarding = withJoin('/onboarding', join);
  const { toast } = useToast();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<Record<string, string>>({});
  const [formErr, setFormErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [seeds, setSeeds] = useState<User[] | null>(null);
  const [claiming, setClaiming] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => { if (me) router.replace(me.squadId ? '/home' : onboarding); }, [me, router, onboarding]);
  useEffect(() => {
    if (!DEMO) return;
    let alive = true;
    listSeedUsers().then((r) => { if (alive && r.ok) setSeeds(r.data); });
    return () => { alive = false; };
  }, []);

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
    router.replace(r.data.squadId ? '/home' : onboarding);
  };

  const claim = async (id: string) => {
    setClaiming(id);
    const r = await claimSeedUser(id);
    setClaiming(null);
    if (r.ok) router.push('/home');
    else toast(errorText(r.error), 'error');
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
        <Button variant="secondary" href={withJoin('/register', join)}>Create an account</Button>
        <Button variant="ghost" href="/forgot-password">Forgot password?</Button>
        {DEV_SKIP && <Button variant="secondary" type="button" loading={claiming === 'seed_kevin'} onClick={() => claim('seed_kevin')}>Skip sign-in (dev only)</Button>}
      </div>

      {DEMO && (
        <section className="mt-6" aria-labelledby="who">
          <h2 id="who" className="font-display font-black text-lg mb-2">Demo: who are you?</h2>
          {!seeds ? (
            <p className="text-ink-faint font-bold">Loading squad…</p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {seeds.map((u) => (
                <Card key={u.id} tappable role="button" tabIndex={0} aria-label={`Play as ${u.name}`}
                  onClick={() => claim(u.id)} onKeyDown={(e) => e.key === 'Enter' && claim(u.id)}
                  className={`text-center ${claiming === u.id ? 'opacity-60' : ''}`}>
                  <div className="text-4xl"><Avatar value={u.avatar} size={48} /></div>
                  <div className="font-display font-extrabold">{u.name}</div>
                </Card>
              ))}
            </div>
          )}
        </section>
      )}
    </AuthShell>
  );
}

export default function Page() {
  return <Suspense fallback={null}><LoginPage /></Suspense>;
}
