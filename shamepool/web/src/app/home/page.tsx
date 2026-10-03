'use client';
import { useConnection, useMe, useMyGoals } from '@/data';
import { AppShell } from '@/components/AppShell';
import { GoalCard } from '@/components/GoalCard';
import { Avatar } from '@/components/ui/Avatar';
import { EmptyState, ListSkeleton } from '@/components/ui/States';
import { Button } from '@/components/ui/Button';
import { MoneyText } from '@/components/ui/Money';
import { usePenaltyTotal } from '@/components/usePenaltyTotal';

function HomeInner() {
  const me = useMe();
  const goals = useMyGoals();
  const conn = useConnection();
  const paid = usePenaltyTotal();
  return (
    <>
      <h1 className="font-display font-black text-3xl">Hey {me?.name} <Avatar value={me?.avatar} size={32} /></h1>
      <div className="grid grid-cols-2 gap-3 my-4">
        <div className="rounded-2xl border-2 border-surface-line p-3 shadow-chunky-sm">
          <p className="text-xs font-extrabold uppercase tracking-wide text-ink-soft">Balance</p>
          <MoneyText cents={me?.balanceCents ?? 0} className="text-3xl" />
        </div>
        <div className="rounded-2xl border-2 border-ember/30 bg-ember-light/50 p-3 shadow-chunky-sm [--edge:var(--color-ember-light)]">
          <p className="text-xs font-extrabold uppercase tracking-wide text-ember-dark">Total paid</p>
          <MoneyText cents={paid} kind="loss" className="text-3xl" />
        </div>
      </div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-display font-black text-xl">My goals</h2>
        <span className="text-sm font-extrabold text-ink-faint">{goals.length}/5</span>
      </div>
      {conn.status === 'connecting' ? <ListSkeleton /> : goals.length === 0 ? (
        <EmptyState title="No commitments yet. Scared?" line="Pick something you keep dodging. We will make it hurt to skip." cta="Make a commitment" href="/goals/new" />
      ) : (
        <div className="space-y-3">
          {goals.map((g) => <GoalCard key={g.id} goal={g} />)}
          {goals.length < 5 && <Button variant="secondary" href="/goals/new">+ New commitment</Button>}
        </div>
      )}
    </>
  );
}

export default function HomePage() {
  return <AppShell><HomeInner /></AppShell>;
}
