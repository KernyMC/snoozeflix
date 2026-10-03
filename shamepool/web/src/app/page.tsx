'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { claimSeedUser, listSeedUsers, useMe, type User } from '@/data';
import { Wordmark } from '@/components/AppShell';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Flakey } from '@/components/ui/Flakey';
import { errorText } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';

const DEMO = process.env.NEXT_PUBLIC_DEMO === 'true';

export default function Welcome() {
  const me = useMe();
  const router = useRouter();
  const { toast } = useToast();
  const [seeds, setSeeds] = useState<User[] | null>(null);
  const [claiming, setClaiming] = useState<string | null>(null);

  useEffect(() => {
    if (!DEMO) return;
    let alive = true;
    listSeedUsers().then((r) => { if (alive && r.ok) setSeeds(r.data); });
    return () => { alive = false; };
  }, []);

  const claim = async (id: string) => {
    setClaiming(id);
    const r = await claimSeedUser(id);
    setClaiming(null);
    if (r.ok) router.push('/home');
    else toast(errorText(r.error), 'error');
  };

  return (
    <main className="mx-auto max-w-md min-h-dvh px-5 py-8 flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center text-center gap-3">
        <Flakey mood="cheer" size={150} />
        <h1 className="text-5xl"><Wordmark /></h1>
        <p className="font-display font-extrabold text-xl text-ink-soft max-w-[18rem]">Flake on your goals. Pay your friends.</p>
      </div>

      <div className="space-y-3 mt-6">
        {me ? (
          <Button href={me.squadId ? '/home' : '/onboarding'}>Continue as <Avatar value={me.avatar} size={24} /> {me.name}</Button>
        ) : (
          <>
            <Button href="/onboarding">Get started</Button>
            <Button variant="secondary" href="/onboarding?join=1">I have an invite code</Button>
          </>
        )}
      </div>

      {DEMO && (
        <section className="mt-8" aria-labelledby="who">
          <h2 id="who" className="font-display font-black text-lg mb-2">Demo: who are you?</h2>
          {!seeds ? (
            <p className="text-ink-faint font-bold">Loading squad…</p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {seeds.map((u) => (
                <Card key={u.id} tappable role="button" tabIndex={0} aria-label={`Play as ${u.name}`}
                  onClick={() => claim(u.id)} onKeyDown={(e) => e.key === 'Enter' && claim(u.id)}
                  className={`text-center ${claiming === u.id ? 'opacity-60' : ''}`}>
                  <div className="text-4xl"><Avatar value={u.avatar} size={48} /></div>
                  <div className="font-display font-extrabold">{u.name}</div>
                </Card>
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
