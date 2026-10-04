'use client';
import { useEffect, useRef, useState } from 'react';
import { kickMember, useMe, useSquad, useSquadMembers } from '@/data';
import { Avatar } from './ui/Avatar';
import { Card } from './ui/Card';
import { errorText } from './ui/States';
import { useToast } from './ui/Toast';

/**
 * Owner-only list of members with a Remove button. Removing takes two taps (the second within 4 s) because it cannot be
 * undone: the person is banned from rejoining with this code. Their pool money stays with the squad.
 */
export function SquadMembers() {
  const me = useMe();
  const squad = useSquad();
  const members = useSquadMembers();
  const { toast } = useToast();
  const [armed, setArmed] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(null), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  if (!me || !squad || squad.ownerUserId !== me.id) return null;
  const others = members.filter((m) => m.id !== me.id);

  const remove = async (id: string, name: string) => {
    if (armed !== id) return setArmed(id);
    setArmed(null);
    setBusy(id);
    const r = await kickMember(id);
    setBusy(null);
    toast(r.ok ? `${name} was removed from the squad` : errorText(r.error), r.ok ? 'success' : 'error');
  };

  return (
    <section aria-labelledby="members">
      <h2 id="members" className="font-display font-black text-xl mb-2">Members</h2>
      <Card className="space-y-2">
        <p className="text-sm font-bold text-ink-soft">You created this squad, so you can remove people. What they already paid stays in the pool and they cannot rejoin with this code.</p>
        {others.length === 0 ? <p className="text-sm font-bold text-ink-faint">Nobody else yet. Share the invite code.</p> : (
          <ul className="space-y-2" aria-label="Squad members">
            {others.map((m) => (
              <li key={m.id} className="flex items-center gap-3">
                <Avatar value={m.avatar} size={32} />
                <span className="flex-1 min-w-0 truncate font-extrabold">{m.name}</span>
                <button type="button" onClick={() => remove(m.id, m.name)} disabled={busy === m.id} aria-label={armed === m.id ? `Confirm removing ${m.name}` : `Remove ${m.name}`}
                  className={`min-h-11 rounded-xl border-2 px-3 font-display font-extrabold text-sm disabled:opacity-50 ${armed === m.id ? 'border-ember bg-ember text-white' : 'border-surface-line bg-white text-ember-dark'}`}>
                  {busy === m.id ? 'Removing…' : armed === m.id ? 'Tap to confirm' : 'Remove'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}

/** Tells a member who was just removed what happened (their squad disappears while they are signed in as the same user). */
export function KickWatcher() {
  const me = useMe();
  const squad = useSquad();
  const { toast } = useToast();
  const last = useRef<{ userId: string; squadId: string; name: string } | null>(null);
  useEffect(() => {
    if (me === undefined) return;
    const prev = last.current;
    if (me && prev && prev.userId === me.id && prev.squadId && !me.squadId) toast(`You are no longer in ${prev.name}.`, 'error');
    last.current = me ? { userId: me.id, squadId: me.squadId ?? '', name: squad?.name ?? prev?.name ?? 'the squad' } : null;
  }, [me, squad, toast]);
  return null;
}
