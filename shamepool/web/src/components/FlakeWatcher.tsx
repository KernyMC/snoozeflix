'use client';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { formatCents, useFeed, useMe } from '@/data';
import { vibrate } from './effects';
import { playSfx } from '@/lib/sfx';
import { Button } from './ui/Button';
import { Flakey } from './ui/Flakey';
import { Icon } from './ui/Icon';
import { CountUpMoney } from './ui/Money';
import { useToast } from './ui/Toast';

interface Flake { id: string; text: string; cents: number }

/** A flake older than this when the watcher started is history, even if it reaches the feed afterwards. */
const HISTORY_GRACE_MS = 60_000;

/** Watches the feed. My new flake → shake + modal. Someone else's → toast. */
export function FlakeWatcher() {
  const me = useMe();
  const feed = useFeed(20);
  const { toast } = useToast();
  const seen = useRef<Set<string> | null>(null);
  const seenFor = useRef<string | null>(null); // whose feed `seen` was taken from
  const since = useRef(0);
  const [flake, setFlake] = useState<Flake | null>(null);

  useEffect(() => {
    if (me === undefined) return;
    if (window.location.search.includes('tv=1')) return; // projector is a viewer, never "the flaker"
    const who = me?.id ?? null;
    // Start over on first load and whenever someone else signs in: everything already in their feed is history.
    if (seen.current === null || seenFor.current !== who) {
      seen.current = new Set(feed.map((f) => f.id));
      seenFor.current = who;
      since.current = Date.now();
      return;
    }
    for (const ev of [...feed].reverse()) {
      if (seen.current.has(ev.id)) continue;
      seen.current.add(ev.id);
      if (ev.kind !== 'flake') continue;
      if (ev.createdAt < since.current - HISTORY_GRACE_MS) continue; // history that arrived late, not a new flake
      const cents = Number(ev.meta?.amountCents ?? 0);
      if (ev.actorUserId === me?.id) {
        vibrate([80, 40, 80]);
        playSfx('flake');
        setFlake({ id: ev.id, text: ev.text, cents });
      } else {
        toast(`${ev.text.split(' flaked')[0]} flaked ${formatCents(cents)}`, 'error');
      }
    }
  }, [feed, me, toast]);

  return (
    <AnimatePresence>
      {flake && (
        <motion.div className="fixed inset-0 z-[60] bg-black/40 flex items-end sm:items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          role="dialog" aria-modal="true" aria-label="You flaked">
          <motion.div
            className="w-full max-w-md bg-ember-light rounded-t-3xl sm:rounded-3xl p-6 text-center"
            initial={{ y: 200 }} animate={{ y: 0, x: [0, -8, 8, -6, 6, 0] }} exit={{ y: 300 }}
            // The slide is a spring; the shake is a timed tween, because a spring cannot run through several keyframes (it throws, and the dialog then never shows while still covering the screen).
            transition={{ y: { type: 'spring', stiffness: 400, damping: 30 }, x: { duration: 0.45, ease: 'easeInOut' } }}
          >
            <div className="flex justify-center"><Flakey mood="melting" size={130} /></div>
            <div className="text-6xl text-ember"><CountUpMoney cents={-flake.cents} kind="loss" className="text-6xl" /></div>
            <p className="font-extrabold text-ember-dark text-lg mt-1"><Icon name="money-wings" /> {flake.text}</p>
            <p className="font-bold text-ink-soft mb-5">The pool thanks you for your service.</p>
            <div className="space-y-3">
              <Button variant="danger" onClick={() => setFlake(null)}>Ouch</Button>
              <Button variant="secondary" href="/home" onClick={() => setFlake(null)}>Commit harder</Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
