'use client';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useState } from 'react';
import { claimSeedUser, listSeedUsers, useMe, useSquad } from '@/data';
import { Wordmark } from './AppShell';
import { CashoutBanner } from './Cashout';
import { inviteUrl } from './InviteQr';
import { Feed, Leaderboard, PoolCard } from './SquadParts';
import { Flakey } from './ui/Flakey';

/**
 * Full-screen viewer for a projector. No nav, huge type. In mock mode a fresh tab
 * silently adopts the first seed user so it can see the squad without onboarding.
 */
export function Projector() {
  const me = useMe();
  const squad = useSquad();
  const [origin, setOrigin] = useState('');
  const [failed, setFailed] = useState(false);

  useEffect(() => { setOrigin(window.location.origin); }, []);
  useEffect(() => {
    if (me !== null) return;
    let alive = true;
    (async () => {
      const seeds = await listSeedUsers();
      if (!alive) return;
      if (seeds.ok && seeds.data[0]) await claimSeedUser(seeds.data[0].id); else setFailed(true);
    })().catch(() => setFailed(true));
    return () => { alive = false; };
  }, [me]);

  if (!squad) {
    return (
      <main className="min-h-dvh grid place-items-center bg-surface-muted p-8 text-center">
        <div><Flakey mood={failed ? 'melting' : 'sleepy'} size={180} /><p className="font-display font-black text-3xl mt-4">{failed ? 'No squad to show' : 'Loading the big screen…'}</p></div>
      </main>
    );
  }
  const joinUrl = inviteUrl(origin, squad.inviteCode);
  return (
    <main className="min-h-dvh bg-surface-muted p-6 grid grid-cols-[1.1fr_1fr_1fr] gap-6 text-[1.15em]" aria-label="Projector view">
      <section className="space-y-5">
        <div className="flex items-center justify-between"><Wordmark className="text-5xl" /><span className="font-display font-black text-3xl text-ink-soft">{squad.name}</span></div>
        <PoolCard squad={squad} big />
        <CashoutBanner />
        <div className="rounded-3xl bg-white border-2 border-surface-line p-5 flex items-center gap-5 shadow-chunky-sm">
          {origin && <QRCodeSVG value={joinUrl} size={150} />}
          <div>
            <p className="text-lg font-extrabold uppercase tracking-wide text-ink-soft">Join the squad</p>
            <p className="font-display font-black text-6xl tracking-[0.2em]">{squad.inviteCode}</p>
          </div>
        </div>
      </section>
      <section className="rounded-3xl bg-white border-2 border-surface-line p-5 shadow-chunky-sm overflow-hidden">
        <h2 className="font-display font-black text-4xl mb-4">Leaderboard</h2>
        <Leaderboard big />
      </section>
      <section className="rounded-3xl bg-white border-2 border-surface-line p-5 shadow-chunky-sm overflow-hidden flex flex-col h-[calc(100dvh-3rem)]">
        <h2 className="font-display font-black text-4xl mb-4">Live feed</h2>
        <div className="flex-1 min-h-0"><Feed limit={30} big autoScroll /></div>
      </section>
    </main>
  );
}
