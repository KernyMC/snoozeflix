'use client';
import { AnimatePresence, motion } from 'framer-motion';
import { Flame, Send } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  postMessage, useFeed, useLeaderboard, useMe, useNow, usePoolFunders, useSquad, type FeedKind, type LeaderboardRow, type Squad,
} from '@/data';
import { Avatar } from './ui/Avatar';
import { Button } from './ui/Button';
import { Card, Pill } from './ui/Card';
import { Flakey } from './ui/Flakey';
import { Icon, type IconName } from './ui/Icon';
import { CountUpMoney, MoneyText } from './ui/Money';
import { ProgressBar } from './ui/ProgressBar';
import { EmptyState, errorText } from './ui/States';
import { useToast } from './ui/Toast';
import { inputCls } from './ui/Field';

export function relTime(ts: number, now: number): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export function PoolCard({ squad, big = false }: { squad: Squad; big?: boolean }) {
  const funders = usePoolFunders();
  const pct = squad.poolGoalCents > 0 ? squad.poolBalanceCents / squad.poolGoalCents : 0;
  return (
    <Card tone="sun" className="space-y-3">
      <div className="flex items-center justify-between">
        <p className={`font-extrabold uppercase tracking-wide text-sun-dark ${big ? 'text-xl' : 'text-xs'}`}><Icon name="pizza" /> {squad.poolGoalName}</p>
        {pct >= 1 && <Pill tone="leaf">FULL!</Pill>}
      </div>
      <div className="flex items-baseline gap-2 flex-wrap">
        <CountUpMoney cents={squad.poolBalanceCents} kind="pool" className={big ? 'text-[96px] leading-none' : 'text-5xl'} />
        <span className={`font-display font-black text-ink-faint ${big ? 'text-4xl' : 'text-xl'}`}>/ <MoneyText cents={squad.poolGoalCents} kind="neutral" className="text-ink-faint" /></span>
      </div>
      <ProgressBar value={pct} tone="sun" label="Pool progress" />
      {funders.length > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label="Who funded the pool">
          {funders.map((f) => (
            <span key={f.user.id} className={`inline-flex items-center gap-1 rounded-full bg-white/70 px-2.5 py-1 font-extrabold ${big ? 'text-lg' : 'text-xs'}`}>
              <Avatar value={f.user.avatar} size={20} /> {f.user.name} <MoneyText cents={f.totalCents} kind="loss" />
            </span>
          ))}
        </div>
      )}
    </Card>
  );
}

const MEDAL = ['bg-sun text-ink', 'bg-surface-line text-ink-soft', 'bg-flame text-white'];

function Row({ r, big, meId }: { r: LeaderboardRow; big?: boolean; meId?: string }) {
  return (
    <motion.li layout transition={{ type: 'spring', stiffness: 500, damping: 35 }}
      className={`flex items-center gap-3 rounded-2xl border-2 px-3 ${big ? 'py-4' : 'py-2.5'} ${r.isFlakeOfWeek ? 'bg-ember-light border-ember/40' : r.user.id === meId ? 'bg-sky-light border-sky/50' : 'bg-white border-surface-line'}`}>
      <span className={`shrink-0 grid place-items-center rounded-full font-display font-black ${big ? 'size-11 text-xl' : 'size-8 text-sm'} ${MEDAL[r.rank - 1] ?? 'bg-surface-muted text-ink-soft'}`}>{r.rank}</span>
      <span className={big ? 'text-4xl' : 'text-2xl'}><Avatar value={r.user.avatar} size={big ? 48 : 32} /></span>
      <div className="flex-1 min-w-0">
        <p className={`font-display font-black truncate ${big ? 'text-2xl' : ''}`}>{r.user.name}</p>
        {r.isFlakeOfWeek && <Pill tone="ember" className="mt-0.5"><Icon name="frozen-face" /> Flake of the Week</Pill>}
      </div>
      <div className={`text-right ${big ? 'text-xl' : 'text-sm'}`}>
        <p className="font-black tabular">{r.completionRate === null ? '—' : `${Math.round(r.completionRate * 100)}%`}</p>
        <p className="flex items-center justify-end gap-2 font-extrabold">
          <span className={`flex items-center gap-0.5 ${r.streak > 0 ? 'text-flame' : 'text-ink-faint'}`}><Flame size={big ? 22 : 15} fill="currentColor" aria-hidden />{r.streak}</span>
          <MoneyText cents={r.totalPaidCents} kind={r.totalPaidCents > 0 ? 'loss' : 'neutral'} />
        </p>
      </div>
    </motion.li>
  );
}

export function Leaderboard({ big = false }: { big?: boolean }) {
  const rows = useLeaderboard();
  const me = useMe();
  if (rows.length === 0) return <EmptyState title="Empty squad" line="Invite friends. Flaking alone is boring." mood="sleepy" />;
  return (
    <div>
      <ul className="space-y-2" aria-label="Leaderboard">
        {rows.map((r) => <Row key={r.user.id} r={r} big={big} meId={me?.id} />)}
      </ul>
      {rows.length === 1 && <p className="text-center text-sm font-bold text-ink-soft mt-3">Invite friends to see the leaderboard heat up.</p>}
    </div>
  );
}

const KIND: Record<FeedKind, { icon: IconName | null; bubble: string }> = {
  commit: { icon: 'lock', bubble: 'bg-sky-light' },
  checkin: { icon: 'check', bubble: 'bg-leaf-light' },
  flake: { icon: 'money-wings', bubble: 'bg-ember-light' },
  milestone: { icon: 'target', bubble: 'bg-sun-light' },
  bot: { icon: null, bubble: 'bg-grape-light' },
  message: { icon: 'chat', bubble: 'bg-surface-muted' },
  cashout: { icon: 'pizza', bubble: 'bg-sun-light' },
  withdrawal: { icon: 'cash', bubble: 'bg-sky-light' },
};

export function Feed({ limit = 50, big = false, autoScroll = false }: { limit?: number; big?: boolean; autoScroll?: boolean }) {
  const feed = useFeed(limit);
  const me = useMe();
  const now = useNow(30_000);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!autoScroll || !box.current) return;
    const el = box.current;
    let dir = 1;
    const id = window.setInterval(() => {
      if (el.scrollHeight <= el.clientHeight) return;
      el.scrollTop += dir;
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 1) dir = -1;
      if (el.scrollTop <= 0) dir = 1;
    }, 60);
    return () => window.clearInterval(id);
  }, [autoScroll, feed.length]);

  if (feed.length === 0) return <EmptyState title="Quiet in here" line="Nothing has happened yet. Suspicious." mood="sleepy" />;
  return (
    <div ref={box} className={autoScroll ? 'h-full overflow-hidden' : ''}>
      <ul className="space-y-2" aria-live="polite" aria-label="Squad feed">
        <AnimatePresence initial={false}>
          {feed.map((f) => {
            const k = KIND[f.kind];
            const bot = f.actorUserId === null;
            return (
              <motion.li key={f.id} layout initial={{ opacity: 0, y: -14, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                className={`flex gap-2.5 rounded-2xl p-3 ${bot ? 'bg-grape-light' : k.bubble} ${f.actorUserId === me?.id ? 'ring-2 ring-sky/40' : ''}`}>
                <span className={`shrink-0 grid place-items-center rounded-full bg-white/70 ${big ? 'size-12 text-2xl' : 'size-9 text-lg'}`}>
                  {bot ? <Flakey mood="smug" size={big ? 36 : 28} /> : k.icon && <Icon name={k.icon} size={big ? 28 : 22} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={`font-extrabold break-words ${big ? 'text-2xl' : 'text-[15px]'} ${bot ? 'text-grape-dark' : ''}`}>
                    {bot && <span className="text-xs font-black uppercase tracking-wide mr-1.5 text-grape-dark/70">Squad Bot</span>}
                    {f.text}
                  </p>
                  <p className={`font-bold text-ink-faint ${big ? 'text-base' : 'text-xs'}`}>{relTime(f.createdAt, now)}</p>
                </div>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </div>
  );
}

export function MessageBox() {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  const send = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    const r = await postMessage(t);
    setBusy(false);
    if (r.ok) setText(''); else toast(errorText(r.error), 'error');
  };
  return (
    <form onSubmit={(e) => { e.preventDefault(); void send(); }} className="flex gap-2">
      <input value={text} onChange={(e) => setText(e.target.value)} maxLength={280} aria-label="Message the squad"
        placeholder="Say something… or @squadbot" className={inputCls} />
      <Button full={false} type="submit" loading={busy} disabled={!text.trim()} aria-label="Send" className="px-4"><Send size={20} strokeWidth={3} /></Button>
    </form>
  );
}

export function useSquadOrNull() { return useSquad(); }
