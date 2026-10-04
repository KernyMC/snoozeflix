'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { Check, Copy, Share2 } from 'lucide-react';
import { createSquad, joinSquad, useMe, useSquad } from '@/data';
import { Wordmark } from '@/components/AppShell';
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
  const router = useRouter();
  const params = useSearchParams();
  const { toast } = useToast();
  const [mode, setMode] = useState<'create' | 'join'>(params.get('join') ? 'join' : 'create');
  const [squadName, setSquadName] = useState('');
  const [poolName, setPoolName] = useState('Pizza night');
  const [poolAmount, setPoolAmount] = useState('60');
  const [code, setCode] = useState(params.get('join') && params.get('join') !== '1' ? (params.get('join') as string) : '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Record<string, string>>({});
  const [created, setCreated] = useState(false);
  const [copied, setCopied] = useState(false);

  const joinParam = params.get('join');
  useEffect(() => { if (me?.squadId && !created) router.replace('/home'); }, [me, created, router]);
  useEffect(() => { if (me === null) router.replace(`/register${joinParam ? `?join=${encodeURIComponent(joinParam)}` : ''}`); }, [me, joinParam, router]);

  if (!me) return <div className="mx-auto max-w-md p-5 space-y-3"><Skeleton className="h-40" /><Skeleton className="h-24" /></div>;

  const step = created && squad ? 3 : 2;

  const doCreate = async () => {
    setErr({});
    const cents = dollarsToCents(poolAmount);
    if (squadName.trim().length < 1) return setErr({ squadName: 'Name your squad.' });
    if (!Number.isInteger(cents) || cents <= 0 || cents > 100_000) return setErr({ poolAmount: errorText('invalid_amount') });
    setBusy(true);
    const r = await createSquad({ name: squadName, poolGoalName: poolName, poolGoalCents: cents });
    setBusy(false);
    if (!r.ok) return toast(errorText(r.error), 'error');
    setCreated(true);
    fireConfetti();
  };

  const doJoin = async () => {
    setErr({});
    setBusy(true);
    const r = await joinSquad(code);
    setBusy(false);
    if (!r.ok) return setErr({ code: errorText(r.error) });
    fireConfetti();
    router.replace('/home');
  };

  const link = typeof window !== 'undefined' && squad ? `${window.location.origin}/onboarding?join=${squad.inviteCode}` : '';
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
