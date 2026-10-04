'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { Check, Copy, Share2 } from 'lucide-react';
import { createSquad, decodeSnapshot, joinSquad, registerUser, useMe, useSquad } from '@/data';
import { Wordmark } from '@/components/AppShell';
import { InviteQr, inviteUrl, useInviteSnapshot } from '@/components/InviteQr';
import { Avatar, AVATARS } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { dollarsToCents, Field } from '@/components/ui/Field';
import { Flakey } from '@/components/ui/Flakey';
import { errorText, Skeleton } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { fireConfetti } from '@/components/effects';

function Onboarding() {
  const me = useMe();
  const squad = useSquad();
  const snapshot = useInviteSnapshot();
  const router = useRouter();
  const params = useSearchParams();
  const { toast } = useToast();
  const [mode, setMode] = useState<'create' | 'join'>(params.get('join') ? 'join' : 'create');
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState(AVATARS[0]);
  const [squadName, setSquadName] = useState('');
  const [poolName, setPoolName] = useState('Pizza night');
  const [poolAmount, setPoolAmount] = useState('60');
  const [code, setCode] = useState(params.get('join') && params.get('join') !== '1' ? (params.get('join') as string) : '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Record<string, string>>({});
  const [created, setCreated] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => { if (me === null) router.replace('/'); }, [me, router]); // sign in first
  // While our own createSquad is in flight the user already has a squad (live mode waits for that row before it
  // resolves), so the guard must not bounce to /home before the invite code screen shows.
  const creating = useRef(false);
  useEffect(() => { if (me?.squadId && !created && !creating.current) router.replace('/home'); }, [me, created, router]);

  if (me === undefined) return <div className="mx-auto max-w-md p-5 space-y-3"><Skeleton className="h-40" /><Skeleton className="h-24" /></div>;

  const step = created && squad ? 3 : me ? 2 : 1;

  const doRegister = async () => {
    setErr({});
    if (name.trim().length < 1 || name.trim().length > 20) return setErr({ name: errorText('invalid_name') });
    setBusy(true);
    const r = await registerUser({ name, avatar });
    setBusy(false);
    if (!r.ok) setErr({ name: errorText(r.error) });
  };

  const doCreate = async () => {
    setErr({});
    const cents = dollarsToCents(poolAmount);
    if (squadName.trim().length < 1) return setErr({ squadName: 'Name your squad.' });
    if (!Number.isInteger(cents) || cents <= 0 || cents > 100_000) return setErr({ poolAmount: errorText('invalid_amount') });
    setBusy(true);
    creating.current = true;
    const r = await createSquad({ name: squadName, poolGoalName: poolName, poolGoalCents: cents });
    setBusy(false);
    if (!r.ok) { creating.current = false; return toast(errorText(r.error), 'error'); }
    setCreated(true);
    fireConfetti();
  };

  const doJoin = async () => {
    setErr({});
    setBusy(true);
    const r = await joinSquad(code, decodeSnapshot(params.get('s')));
    setBusy(false);
    if (!r.ok) return setErr({ code: errorText(r.error) });
    fireConfetti();
    router.replace('/home');
  };

  const link = typeof window !== 'undefined' && squad ? inviteUrl(window.location.origin, squad.inviteCode, snapshot) : '';
  const copy = async () => {
    try { await navigator.clipboard.writeText(squad?.inviteCode ?? ''); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    catch { toast('Could not copy. Long-press the code instead.', 'error'); }
  };
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: 'Join my shamepool squad', text: `Join with code ${squad?.inviteCode}`, url: link });
      else await copy();
    } catch { /* cancelled */ }
  };

  return (
    <main className="mx-auto max-w-md min-h-dvh px-5 py-6">
      <div className="flex items-center justify-between mb-4">
        <Wordmark className="text-2xl" />
        <div className="flex gap-1.5" aria-label={`Step ${step} of 3`}>
          {[1, 2, 3].map((n) => <span key={n} className={`h-2.5 w-8 rounded-full ${n <= step ? 'bg-sky' : 'bg-surface-line'}`} />)}
        </div>
      </div>

      {step === 1 && (
        <section className="space-y-5">
          <div className="flex justify-center"><Flakey mood="happy" size={110} /></div>
          <h1 className="font-display font-black text-3xl text-center">Who are you?</h1>
          <Field label="Your name" value={name} maxLength={20} onChange={(e) => setName(e.target.value)} placeholder="Kevin" error={err.name} autoFocus />
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wide text-ink-soft mb-1.5">Pick an avatar</p>
            <div className="grid grid-cols-5 gap-2" role="radiogroup" aria-label="Avatar">
              {AVATARS.map((e) => (
                <button key={e} role="radio" aria-checked={avatar === e} onClick={() => setAvatar(e)}
                  className={`aspect-square rounded-xl border-2 p-1 grid place-items-center shadow-chunky-sm ${avatar === e ? 'border-sky bg-sky-light [--edge:var(--color-sky-dark)]' : 'border-surface-line bg-white'}`}><Avatar value={e} size={48} /></button>
              ))}
            </div>
          </div>
          <Button onClick={doRegister} loading={busy}>Continue</Button>
        </section>
      )}

      {step === 2 && (
        <section className="space-y-5">
          <h1 className="font-display font-black text-3xl text-center">Hi {me?.name}! Your squad?</h1>
          <div className="grid grid-cols-2 gap-2" role="tablist">
            {(['create', 'join'] as const).map((m) => (
              <button key={m} role="tab" aria-selected={mode === m} onClick={() => { setMode(m); setErr({}); }}
                className={`rounded-xl border-2 py-3 font-display font-extrabold shadow-chunky-sm ${mode === m ? 'border-sky bg-sky-light text-sky-dark [--edge:var(--color-sky-dark)]' : 'border-surface-line bg-white text-ink-soft'}`}>
                {m === 'create' ? 'Create squad' : 'Join squad'}
              </button>
            ))}
          </div>
          {mode === 'create' ? (
            <div className="space-y-4">
              <Field label="Squad name" value={squadName} maxLength={30} onChange={(e) => setSquadName(e.target.value)} placeholder="MHacks Crew" error={err.squadName} />
              <Field label="Pool goal" value={poolName} maxLength={30} onChange={(e) => setPoolName(e.target.value)} hint="What will you spend the pool on?" />
              <Field label="Goal amount ($)" inputMode="decimal" value={poolAmount} onChange={(e) => setPoolAmount(e.target.value)} error={err.poolAmount} />
              <Button onClick={doCreate} loading={busy}>Create squad</Button>
            </div>
          ) : (
            <div className="space-y-4">
              <Field label="Invite code" value={code} maxLength={8} autoCapitalize="characters" onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="PIZZA6" error={err.code} className="text-center tracking-[0.3em] text-xl font-black uppercase" />
              <Button onClick={doJoin} loading={busy} disabled={code.trim().length === 0}>Join squad</Button>
            </div>
          )}
        </section>
      )}

      {step === 3 && squad && (
        <section className="space-y-5 text-center">
          <div className="flex justify-center"><Flakey mood="cheer" size={120} /></div>
          <h1 className="font-display font-black text-3xl">Squad created!</h1>
          <p className="text-ink-soft font-bold">Send this code to your friends. The more people, the bigger the pool.</p>
          <Card tone="sun" className="py-6">
            <p className="text-xs font-extrabold uppercase tracking-wide text-ink-soft">Invite code</p>
            <p className="font-display font-black text-5xl tracking-[0.25em] tabular mt-1" aria-label={`Invite code ${squad.inviteCode.split('').join(' ')}`}>{squad.inviteCode}</p>
            <div className="mt-4 flex flex-col items-center gap-2">
              <InviteQr code={squad.inviteCode} size={132} />
              <p className="text-sm font-bold text-ink-soft">Or have them scan this to join.</p>
            </div>
          </Card>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="secondary" onClick={copy}>{copied ? <Check size={20} strokeWidth={3} /> : <Copy size={20} strokeWidth={3} />}{copied ? 'Copied' : 'Copy'}</Button>
            <Button variant="secondary" onClick={share}><Share2 size={20} strokeWidth={3} />Share</Button>
          </div>
          <Button href="/goals/new">Add my first goal</Button>
          <Button variant="ghost" href="/home">Skip for now</Button>
        </section>
      )}
    </main>
  );
}

export default function Page() {
  return <Suspense fallback={null}><Onboarding /></Suspense>;
}
