'use client';
import { useRouter } from 'next/navigation';
import { logout, resetDemoData, useConnection, useMe, useSquad } from '@/data';
import { AccountSettings, ProfileCard } from '@/components/AccountForms';
import { AppShell } from '@/components/AppShell';
import { PlanCard } from '@/components/BillingForms';
import { NewPoolGoal } from '@/components/Cashout';
import { InviteQr } from '@/components/InviteQr';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';

const DEMO = process.env.NEXT_PUBLIC_DEMO === 'true';

function Settings() {
  const me = useMe();
  const squad = useSquad();
  const conn = useConnection();
  const router = useRouter();
  const h2 = 'font-display font-black text-xl';
  return (
    <div className="space-y-6">
      <h1 className="font-display font-black text-3xl">My profile</h1>
      <ProfileCard />

      <section aria-labelledby="plan" className="space-y-3">
        <h2 id="plan" className={h2}>Plan</h2>
        <PlanCard />
      </section>

      <section aria-labelledby="acct" className="space-y-3">
        <h2 id="acct" className={h2}>Account</h2>
        <AccountSettings />
      </section>

      {squad && (
        <section aria-labelledby="sq" className="space-y-3">
          <h2 id="sq" className={h2}>Squad</h2>
          <Card tone="sun" className="flex items-center gap-3">
            <InviteQr code={squad.inviteCode} size={84} />
            <div className="min-w-0">
              <p className="font-display font-black text-xl truncate">{squad.name}</p>
              <p className="font-bold">Invite code <b className="tracking-widest">{squad.inviteCode}</b></p>
              <p className="text-sm font-bold text-ink-soft">Scan to sign up and join.</p>
            </div>
          </Card>
          <NewPoolGoal />
        </section>
      )}

      <section aria-labelledby="more" className="space-y-3">
        <h2 id="more" className={h2}>More</h2>
        <Button variant="secondary" href="/wallet"><Icon name="cash" /> Wallet and withdrawals</Button>
        <Button variant="secondary" href="/squad?tv=1"><Icon name="tv" /> Open projector view</Button>
        <Card>
          <p className="font-extrabold">Backend: <b className="text-sky-dark">{conn.mode}</b> ({conn.status})</p>
          {DEMO && <p className="text-sm font-bold text-ink-soft mt-1">Demo controls live in the <Icon name="wrench" /> button. Add <code>?mockSlow=1</code> or <code>?mockError=1</code> to any URL to test loading and error states.</p>}
        </Card>
      </section>

      <div className="space-y-3">
        <Button variant="secondary" onClick={async () => { await logout(); router.replace('/'); }}>Sign out{me ? ` (${me.name})` : ''}</Button>
        {DEMO && <Button variant="danger" onClick={async () => { await resetDemoData(); router.push('/'); }}>Reset demo data</Button>}
      </div>
    </div>
  );
}

export default function Page() {
  return <AppShell><Settings /></AppShell>;
}
