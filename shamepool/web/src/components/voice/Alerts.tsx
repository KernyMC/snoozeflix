'use client';
import { useEffect, useRef } from 'react';
import { type FeedKind, type Goal, useFeed, useMe, useMyGoals } from '@/data';
import { notify } from '@/lib/notify';
import { playSfx } from '@/lib/sfx';
import { speak, speakQueued, usePrefs } from '@/lib/voice';
import { useGoalStatus } from '../goalStatus';

const TITLES: Partial<Record<FeedKind, string>> = {
  flake: 'Flake alert', bot: 'Squad Bot', milestone: 'Pool milestone', cashout: 'Cash-out', withdrawal: 'Wallet', checkin: 'Promise kept',
};
const REMIND_MS = 30 * 60_000;

/** 30 minutes before a deadline: one nudge per goal per day, spoken and/or as a notification. */
function Reminder({ goal }: { goal: Goal }) {
  const { state, msLeft, today } = useGoalStatus(goal);
  const prefs = usePrefs();
  useEffect(() => {
    if (state !== 'due' || msLeft <= 0 || msLeft > REMIND_MS) return;
    if (!prefs.voice && !prefs.notify && !prefs.sfx) return;
    const key = `shamepool-remind:${goal.id}:${today}`;
    try { if (localStorage.getItem(key)) return; localStorage.setItem(key, '1'); } catch { /* no storage: may repeat */ }
    const mins = Math.max(1, Math.ceil(msLeft / 60_000));
    const line = `${goal.title} closes in ${mins} ${mins === 1 ? 'minute' : 'minutes'}. Flakey is sweating.`;
    playSfx('nudge');
    if (prefs.notify) void notify('Deadline soon', line, key);
    if (prefs.voice) void speak(line);
  }, [state, msLeft, today, goal.id, goal.title, prefs.voice, prefs.notify, prefs.sfx]);
  return null;
}

/** Reads bot lines aloud and shows OS notifications for new squad activity. Mounted once in Providers. */
export function Alerts() {
  const me = useMe();
  const feed = useFeed(20);
  const goals = useMyGoals();
  const prefs = usePrefs();
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (me === undefined) return;
    if (seen.current === null) { seen.current = new Set(feed.map((f) => f.id)); return; } // ignore history on load
    const projector = window.location.search.includes('tv=1');
    for (const ev of [...feed].reverse()) {
      if (seen.current.has(ev.id)) continue;
      seen.current.add(ev.id);
      if (prefs.voice && ev.actorUserId === null && ev.kind === 'bot') speakQueued(ev.text);
      const title = TITLES[ev.kind];
      if (prefs.notify && !projector && title && ev.actorUserId !== me?.id && document.hidden) void notify(title, ev.text, ev.id);
    }
  }, [feed, me, prefs.voice, prefs.notify]);

  return <>{goals.map((g) => <Reminder key={g.id} goal={g} />)}</>;
}
