'use client';
import { Bot, Flame, Home, LogOut, Plus, User, Users } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { logout, useBilling, useMe, useMyGoals, useSquad } from '@/data';
import { Pill } from './ui/Card';
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
  const router = useRouter();
  const path = usePathname();
  const [leaving, setLeaving] = useState(false);
  // Free users see their tier on every screen but the profile, which shows it on its own card. Paid users never see it here.
  const showFreeTier = useBilling().tier === 'free' && !path.startsWith('/settings');
  const streak = goals.reduce((m, g) => Math.max(m, g.streak), 0);
  const signOut = async () => {
    setLeaving(true);
    await logout();
    router.replace('/');
  };
  return (
    <header className="sticky top-0 z-30 h-14 bg-white border-b-2 border-surface-line">
      <div className="mx-auto max-w-md h-full px-3 flex items-center gap-2">
        <Link href="/settings" aria-label="My profile" className="size-10 rounded-full bg-sky-light grid place-items-center text-xl shrink-0"><Avatar value={me?.avatar} size={40} /></Link>
        <div className={`flex items-center gap-1 font-display font-black ${streak > 0 ? 'text-flame' : 'text-ink-faint'}`} aria-label={`${streak} day streak`}>
          <Flame size={22} strokeWidth={2.5} fill="currentColor" aria-hidden />{streak}
        </div>
        {/* One row, 32px tall. The tier label stacks into two lines when squeezed and drops to a clipped second row when even that cannot fit. */}
        <div className="flex-1 min-w-0 h-8 overflow-hidden flex flex-wrap items-center justify-center gap-x-1 gap-y-4">
          <Link href="/wallet" className="shrink-0 whitespace-nowrap rounded-full bg-surface-muted px-2.5 py-1 text-sm min-h-8 inline-flex items-center" aria-label="Your balance, open wallet"><Icon name="cash" />&nbsp;<MoneyText cents={me?.balanceCents ?? 0} /></Link>
          <span className="shrink-0 whitespace-nowrap rounded-full bg-sun-light px-2.5 py-1 text-sm" aria-label="Pool balance"><Icon name="pizza" /> <MoneyText cents={squad?.poolBalanceCents ?? 0} kind="pool" /></span>
          {showFreeTier && <Pill tone="gray" className="basis-[min-content] grow max-w-max min-h-5 justify-center !px-2 text-center leading-[1.05]">Free tier</Pill>}
        </div>
        <button type="button" onClick={signOut} disabled={leaving} aria-label="Sign out" title="Sign out"
          className="group size-10 rounded-full bg-surface-muted grid place-items-center text-ink shrink-0 active:translate-y-px disabled:opacity-50">
          <LogOut size={20} strokeWidth={2.5} aria-hidden className="motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-out group-hover:translate-x-1 group-focus-visible:translate-x-1" />
        </button>
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
        <Link href="/goals/new" aria-label="New goal" className="group relative flex-1 min-h-[56px]">
          {/* The bar rising to wrap the button: a 3px white rim carrying the bar's own 2px line. */}
          <span aria-hidden className="absolute left-1/2 -top-[11px] size-[58px] -translate-x-1/2 rounded-full bg-white border-2 border-surface-line" />
          {/* Hides the rest of that rim inside the bar, so the line only runs over the top of the button. */}
          <span aria-hidden className="absolute left-1/2 top-0 h-12 w-[58px] -translate-x-1/2 bg-white" />
          <span className="absolute left-1/2 -top-1.5 size-12 -translate-x-1/2 rounded-full bg-primary text-white grid place-items-center shadow-chunky [--edge:var(--color-primary-dark)] group-active:translate-y-1 group-active:shadow-none"><Plus size={28} strokeWidth={3.5} /></span>
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
