'use client';
import { Bot, Flame, Home, Plus, User, Users } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useMe, useMyGoals, useSquad } from '@/data';
import { MoneyText } from './ui/Money';
import { Icon } from './ui/Icon';
import { Skeleton } from './ui/States';
import { Avatar } from '@/components/ui/Avatar';
import { Flakey } from './ui/Flakey';

/** Redirects per edge cases E7/E8. Returns the user when the screen may render. */
export function useGate(requireSquad = true) {
  const me = useMe();
  const router = useRouter();
  useEffect(() => {
    if (me === null) router.replace('/');
    else if (me && requireSquad && !me.squadId) router.replace('/onboarding');
  }, [me, requireSquad, router]);
  return me && (!requireSquad || me.squadId) ? me : null;
}

export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`font-display font-black lowercase tracking-tight ${className}`}>
      shame<span className="text-sun-dark">pool</span>
    </span>
  );
}

function TopBar() {
  const me = useMe();
  const goals = useMyGoals();
  const squad = useSquad();
  const streak = goals.reduce((m, g) => Math.max(m, g.streak), 0);
  return (
    <header className="sticky top-0 z-30 h-14 bg-white border-b-2 border-surface-line">
      <div className="mx-auto max-w-md h-full px-3 flex items-center gap-2">
        <Link href="/settings" aria-label="My profile" className="size-10 rounded-full bg-sky-light grid place-items-center text-xl shrink-0"><Avatar value={me?.avatar} size={40} /></Link>
        <div className={`flex items-center gap-1 font-display font-black ${streak > 0 ? 'text-flame' : 'text-ink-faint'}`} aria-label={`${streak} day streak`}>
          <Flame size={22} strokeWidth={2.5} fill="currentColor" aria-hidden />{streak}
        </div>
        <div className="flex-1 flex justify-center gap-1.5 min-w-0">
          <Link href="/wallet" className="rounded-full bg-surface-muted px-2.5 py-1 text-sm min-h-8 inline-flex items-center" aria-label="Your balance, open wallet"><Icon name="cash" />&nbsp;<MoneyText cents={me?.balanceCents ?? 0} /></Link>
          <span className="rounded-full bg-sun-light px-2.5 py-1 text-sm" aria-label="Pool balance"><Icon name="pizza" /> <MoneyText cents={squad?.poolBalanceCents ?? 0} kind="pool" /></span>
        </div>
        <Link href="/bot" aria-label="Squad Bot" className="size-10 rounded-full bg-grape-light grid place-items-center text-grape-dark shrink-0"><Bot size={22} strokeWidth={2.5} /></Link>
      </div>
    </header>
  );
}

function TabBar() {
  const path = usePathname();
  const tab = (href: string, label: string, Icon: typeof Home, tint: string) => {
    const active = path === href || (href !== '/home' && path.startsWith(href));
    return (
      <Link href={href} aria-current={active ? 'page' : undefined} className="flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[56px]">
        <span className={`rounded-xl px-4 py-1 ${active ? 'bg-sky-light' : ''} ${active ? tint : 'text-ink-faint'}`}><Icon size={26} strokeWidth={2.5} /></span>
        <span className={`text-[11px] font-extrabold uppercase tracking-wide ${active ? 'text-sky-dark' : 'text-ink-faint'}`}>{label}</span>
      </Link>
    );
  };
  return (
    <nav className="fixed bottom-0 inset-x-0 z-30 bg-white border-t-2 border-surface-line pb-[env(safe-area-inset-bottom)]" aria-label="Main">
      <div className="mx-auto max-w-md flex items-end">
        {tab('/home', 'Home', Home, 'text-sky')}
        {tab('/squad', 'Squad', Users, 'text-sun-dark')}
        <Link href="/goals/new" aria-label="New goal" className="flex-1 flex justify-center -mt-5 min-h-[56px]">
          <span className="size-14 rounded-full bg-primary text-white grid place-items-center shadow-chunky [--edge:var(--color-primary-dark)] active:translate-y-1 active:shadow-none"><Plus size={30} strokeWidth={3.5} /></span>
        </Link>
        {tab('/settings', 'Profile', User, 'text-sky')}
        {tab('/bot', 'Bot', Bot, 'text-grape')}
      </div>
    </nav>
  );
}

export function AppShell({ children, requireSquad = true, hideNav = false }: { children: React.ReactNode; requireSquad?: boolean; hideNav?: boolean }) {
  const me = useGate(requireSquad);
  if (!me) {
    return (
      <div className="mx-auto max-w-md p-4 space-y-4" role="status" aria-label="Loading">
        <div className="flex justify-center py-6"><Flakey mood="sleepy" size={90} /></div>
        <Skeleton className="h-24" /><Skeleton className="h-24" />
      </div>
    );
  }
  return (
    <>
      {!hideNav && <TopBar />}
      <main className={`mx-auto max-w-md px-4 pt-4 ${hideNav ? '' : 'pb-32'}`}>{children}</main>
      {!hideNav && <TabBar />}
    </>
  );
}
