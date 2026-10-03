'use client';
import { useRouter } from 'next/navigation';
import { resetDemoData, useConnection, useMe, useSquad } from '@/data';
import { AppShell } from '@/components/AppShell';
import { NewPoolGoal } from '@/components/Cashout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { MoneyText } from '@/components/ui/Money';

const DEMO = process.env.NEXT_PUBLIC_DEMO === 'true';

function Settings() {
  const me = useMe();
  const squad = useSquad();
  const conn = useConnection();
  const router = useRouter();
  return (
    <div className="space-y-5">
      <h1 className="font-display font-black text-3xl">Settings</h1>
      <Card className="flex items-center gap-4">
        <div className="size-16 rounded-full bg-sky-light grid place-items-center text-4xl">{me?.avatar}</div>
        <div>
          <p className="font-display font-black text-2xl">{me?.name}</p>
          <p className="font-bold text-ink-soft">Balance <MoneyText cents={me?.balanceCents ?? 0} /></p>
        </div>
      </Card>
      {squad && <Card tone="sun"><p className="text-xs font-extrabold uppercase tracking-wide text-ink-soft">Squad</p><p className="font-display font-black text-xl">{squad.name}</p><p className="font-bold">Invite code <b className="tracking-widest">{squad.inviteCode}</b></p></Card>}
      <NewPoolGoal />
      <Card>
        <p className="font-extrabold">Backend: <b className="text-sky-dark">{conn.mode}</b> ({conn.status})</p>
        {DEMO && <p className="text-sm font-bold text-ink-soft mt-1">Demo controls live in the 🛠 button. Add <code>?mockSlow=1</code> or <code>?mockError=1</code> to any URL to test loading and error states.</p>}
      </Card>
      <Button variant="secondary" href="/squad?tv=1">📺 Open projector view</Button>
      <Button variant="secondary" onClick={() => router.push('/')}>Switch user</Button>
      {DEMO && <Button variant="danger" onClick={async () => { await resetDemoData(); router.push('/'); }}>Reset demo data</Button>}
    </div>
  );
}

export default function Page() {
  return <AppShell><Settings /></AppShell>;
}
