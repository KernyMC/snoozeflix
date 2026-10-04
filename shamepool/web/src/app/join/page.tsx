'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { decodeSnapshot, joinSquad, registerUser, useMe } from '@/data';
import { cleanCode } from '@/components/InviteQr';
import { Avatar, AVATARS } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Flakey } from '@/components/ui/Flakey';
import { errorText } from '@/components/ui/States';
import { fireConfetti } from '@/components/effects';

/** Where a scanned QR lands: one card, a nickname, Join or Close. No account form, like joining a quiz game. */
function JoinCard() {
  const router = useRouter();
  const params = useSearchParams();
  const me = useMe();
  const snapshot = decodeSnapshot(params.get('s'));
  const code = cleanCode(params.get('code') ?? snapshot?.code ?? '');
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState(AVATARS[0]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const close = () => router.replace(me?.squadId ? '/home' : '/');

  const join = async () => {
    if (busy) return;
    setErr('');
    setBusy(true);
    if (!me) {
      const u = await registerUser({ name, avatar });
      if (!u.ok) { setBusy(false); return setErr(errorText(u.error)); }
    }
    const r = await joinSquad(code, snapshot);
    setBusy(false);
    if (!r.ok) return setErr(errorText(r.error));
    fireConfetti();
    router.replace('/home');
  };

  const title = snapshot?.name ?? 'a squad';
  return (
    <main className="min-h-dvh grid place-items-center bg-surface-muted p-5">
      <section role="dialog" aria-modal="true" aria-label={`Join ${title}`} className="w-full max-w-sm rounded-3xl bg-white border-2 border-surface-line p-6 space-y-5 shadow-chunky [--edge:var(--color-surface-line)]">
        <div className="flex justify-center"><Flakey mood="cheer" size={96} /></div>
        {!code ? (
          <>
            <h1 className="font-display font-black text-2xl text-center">This invite link is broken</h1>
            <p className="text-center font-bold text-ink-soft">Ask your friend to show the QR code again.</p>
            <Button variant="secondary" onClick={close}>Close</Button>
          </>
        ) : me?.squadId ? (
          <>
            <h1 className="font-display font-black text-2xl text-center">You are already in a squad</h1>
            <p className="text-center font-bold text-ink-soft">Leave it first to join another one.</p>
            <Button onClick={close}>Go to my squad</Button>
          </>
        ) : (
          <>
            <div className="text-center">
              <p className="text-xs font-extrabold uppercase tracking-wide text-ink-soft">You are invited to</p>
              <h1 className="font-display font-black text-3xl mt-1 break-words">{title}</h1>
              {snapshot && <p className="font-bold text-ink-soft mt-1">Goal: {snapshot.poolGoalName}</p>}
              <p className="mt-2 inline-block rounded-full bg-sky-light px-3 py-1 font-display font-black tracking-[0.2em] text-sky-dark">{code}</p>
            </div>
            {me ? (
              <p className="text-center font-bold text-ink-soft">Joining as <strong className="text-ink">{me.name}</strong></p>
            ) : (
              <>
                <Field label="Your nickname" value={name} maxLength={20} onChange={(e) => setName(e.target.value)} placeholder="Kevin" autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) void join(); }} />
                <div className="grid grid-cols-5 gap-2" role="radiogroup" aria-label="Avatar">
                  {AVATARS.map((a) => (
                    <button key={a} role="radio" aria-checked={avatar === a} onClick={() => setAvatar(a)}
                      className={`aspect-square rounded-xl border-2 p-1 grid place-items-center shadow-chunky-sm ${avatar === a ? 'border-sky bg-sky-light [--edge:var(--color-sky-dark)]' : 'border-surface-line bg-white'}`}><Avatar value={a} size={40} /></button>
                  ))}
                </div>
              </>
            )}
            {err && <p className="text-sm text-ember-dark font-extrabold text-center" role="alert">{err}</p>}
            <div className="space-y-2">
              <Button onClick={join} loading={busy} disabled={!me && name.trim().length === 0}>Join squad</Button>
              <Button variant="ghost" onClick={close}>Close</Button>
            </div>
          </>
        )}
      </section>
    </main>
  );
}

export default function JoinPage() {
  return <Suspense fallback={null}><JoinCard /></Suspense>;
}
