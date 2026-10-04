'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { decodeSnapshot, joinSquad, useMe, useSquad } from '@/data';
import { cleanCode, withJoin } from '@/components/InviteQr';
import { Button } from '@/components/ui/Button';
import { Flakey } from '@/components/ui/Flakey';
import { errorText } from '@/components/ui/States';
import { fireConfetti } from '@/components/effects';

/**
 * Where a scanned QR lands. Signed out: sign in or create an account first (the invite rides along and brings you back
 * here). Signed in: one tap to join. Already in this squad: straight to it.
 */
function JoinCard() {
  const router = useRouter();
  const params = useSearchParams();
  const me = useMe();
  const squad = useSquad();
  const rawSnap = params.get('s');
  const snapshot = decodeSnapshot(rawSnap);
  const code = cleanCode(params.get('code') ?? snapshot?.code ?? '');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const alreadyHere = !!me?.squadId && !!squad && squad.inviteCode === code;

  useEffect(() => { if (alreadyHere) router.replace('/home'); }, [alreadyHere, router]);

  const close = () => router.replace(me?.squadId ? '/home' : me ? '/onboarding' : '/');

  const join = async () => {
    if (busy) return;
    setErr('');
    setBusy(true);
    const r = await joinSquad(code, snapshot);
    setBusy(false);
    if (!r.ok) return setErr(errorText(r.error));
    fireConfetti();
    router.replace('/home');
  };

  const title = snapshot?.name ?? 'a squad';
  let body: React.ReactNode;
  if (!code) {
    body = (
      <>
        <h1 className="font-display font-black text-2xl text-center">This invite link is broken</h1>
        <p className="text-center font-bold text-ink-soft">Ask your friend to show the QR code again.</p>
        <Button variant="secondary" onClick={close}>Close</Button>
      </>
    );
  } else if (me === undefined || alreadyHere) {
    body = <p className="text-center font-bold text-ink-soft" role="status">Loading your invite…</p>;
  } else if (me?.squadId) {
    body = (
      <>
        <h1 className="font-display font-black text-2xl text-center">You are already in a squad</h1>
        <p className="text-center font-bold text-ink-soft">You can only be in one squad at a time.</p>
        <Button onClick={close}>Go to my squad</Button>
      </>
    );
  } else {
    body = (
      <>
        <div className="text-center">
          <p className="text-xs font-extrabold uppercase tracking-wide text-ink-soft">You are invited to</p>
          <h1 className="font-display font-black text-3xl mt-1 break-words">{title}</h1>
          {snapshot && <p className="font-bold text-ink-soft mt-1">Goal: {snapshot.poolGoalName}</p>}
          <p className="mt-2 inline-block rounded-full bg-sky-light px-3 py-1 font-display font-black tracking-[0.2em] text-sky-dark">{code}</p>
        </div>
        {me ? (
          <>
            <p className="text-center font-bold text-ink-soft">Joining as <strong className="text-ink">{me.name}</strong></p>
            {err && <p className="text-sm text-ember-dark font-extrabold text-center" role="alert">{err}</p>}
            <div className="space-y-2">
              <Button onClick={join} loading={busy}>Join squad</Button>
              <Button variant="ghost" onClick={close}>Close</Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-center font-bold text-ink-soft">Sign in or create an account to join. We will bring you right back here.</p>
            <div className="space-y-2">
              <Button href={withJoin('/', code, rawSnap)}>Sign in to join</Button>
              <Button variant="secondary" href={withJoin('/register', code, rawSnap)}>Create an account</Button>
              <Button variant="ghost" onClick={close}>Close</Button>
            </div>
          </>
        )}
      </>
    );
  }

  return (
    <main className="min-h-dvh grid place-items-center bg-surface-muted p-5">
      <section role="dialog" aria-modal="true" aria-label={`Join ${title}`} className="w-full max-w-sm rounded-3xl bg-white border-2 border-surface-line p-6 space-y-5 shadow-chunky [--edge:var(--color-surface-line)]">
        <div className="flex justify-center"><Flakey mood="cheer" size={96} /></div>
        {body}
      </section>
    </main>
  );
}

export default function JoinPage() {
  return <Suspense fallback={null}><JoinCard /></Suspense>;
}
