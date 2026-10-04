'use client';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useConnection, useSquad } from '@/data';
import { AppShell } from '@/components/AppShell';
import { CashoutBanner } from '@/components/Cashout';
import { InviteQr } from '@/components/InviteQr';
import { Projector } from '@/components/Projector';
import { Feed, Leaderboard, MessageBox, PoolCard } from '@/components/SquadParts';
import { ListSkeleton } from '@/components/ui/States';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';

function Dashboard() {
  const squad = useSquad();
  const conn = useConnection();
  if (conn.status === 'connecting' || !squad) return <ListSkeleton rows={4} h="h-28" />;
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="font-display font-black text-3xl truncate">{squad.name}</h1>
        <Button href="/squad?tv=1" variant="ghost" full={false} className="px-2 min-h-11"><Icon name="tv" /> TV</Button>
      </div>
      <PoolCard squad={squad} />
      <CashoutBanner />
      <section aria-labelledby="lb"><h2 id="lb" className="font-display font-black text-xl mb-2">Leaderboard</h2><Leaderboard /></section>
      <Card tone="grape" className="!p-3 flex items-center gap-3 text-grape-dark">
        <InviteQr code={squad.inviteCode} size={84} />
        <div className="min-w-0">
          <p className="text-xs font-extrabold uppercase tracking-wide">Invite code</p>
          <p className="font-display font-black text-2xl tracking-widest">{squad.inviteCode}</p>
          <p className="text-sm font-bold text-ink-soft">Scan to sign up and join.</p>
        </div>
      </Card>
      <section aria-labelledby="fd" className="space-y-3">
        <h2 id="fd" className="font-display font-black text-xl">Feed</h2>
        <MessageBox />
        <Feed />
      </section>
    </div>
  );
}

function Switch() {
  const tv = useSearchParams().get('tv') === '1';
  if (tv) return <Projector />;
  return <AppShell><Dashboard /></AppShell>;
}

export default function SquadPage() {
  return <Suspense fallback={null}><Switch /></Suspense>;
}
