'use client';
import { useEffect, useMemo, useState } from 'react';
import type {
  BotThreadMessage, CashoutProposal, Cents, Checkin, DemoFlags, FeedEvent, Goal, LeaderboardRow, Penalty, Squad, User,
} from '../types';
import { leaderboardFor, openProposal } from './engine';
import { useMockStore } from './store';

const useS = () => useMockStore((s) => s.state);
const useUserId = () => useMockStore((s) => s.userId);
const useHydrated = () => useMockStore((s) => s.hydrated);

/** Wall-clock respecting the demo time offset; re-renders every `intervalMs`. */
export function useNow(intervalMs = 1000): number {
  const offset = useMockStore((s) => s.state.demo.timeOffsetMs);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  void tick;
  return Date.now() + offset;
}

export function useConnection(): { status: 'connecting' | 'ready' | 'error'; mode: 'mock' | 'live' } {
  const hydrated = useHydrated();
  return { status: hydrated ? 'ready' : 'connecting', mode: 'mock' };
}

/** undefined = loading, null = no identity */
export function useMe(): User | null | undefined {
  const s = useS();
  const id = useUserId();
  const hydrated = useHydrated();
  if (!hydrated) return undefined;
  return id ? s.users[id] ?? null : null;
}

export function useSquad(): Squad | null {
  const s = useS();
  const me = useMe();
  return me?.squadId ? s.squads[me.squadId] ?? null : null;
}

export function useSquadMembers(): User[] {
  const s = useS();
  const me = useMe();
  return useMemo(() => (me?.squadId ? Object.values(s.users).filter((u) => u.squadId === me.squadId) : []), [s, me?.squadId]);
}

export function useMyGoals(): Goal[] {
  const s = useS();
  const id = useUserId();
  return useMemo(() => Object.values(s.goals).filter((g) => g.userId === id && g.active).sort((a, b) => a.createdAt - b.createdAt), [s, id]);
}

export function useGoal(goalId: string): Goal | null {
  const s = useS();
  return s.goals[goalId] ?? null;
}

export function useGoalHistory(goalId: string): { checkins: Checkin[]; penalties: Penalty[] } {
  const s = useS();
  return useMemo(() => ({
    checkins: Object.values(s.checkins).filter((c) => c.goalId === goalId && c.status === 'completed').sort((a, b) => b.localDate.localeCompare(a.localDate)),
    penalties: Object.values(s.penalties).filter((p) => p.goalId === goalId).sort((a, b) => b.localDate.localeCompare(a.localDate)),
  }), [s, goalId]);
}

export function useActiveCheckin(goalId: string): Checkin | null {
  const s = useS();
  return useMemo(() => Object.values(s.checkins).find((c) => c.goalId === goalId && c.status === 'in_progress') ?? null, [s, goalId]);
}

export function useLeaderboard(): LeaderboardRow[] {
  const s = useS();
  const me = useMe();
  const now = useNow(30_000);
  return useMemo(() => (me?.squadId ? leaderboardFor(s, me.squadId, now) : []), [s, me?.squadId, now]);
}

export function useFeed(limit = 50): FeedEvent[] {
  const s = useS();
  const me = useMe();
  return useMemo(() => (me?.squadId ? s.feed.filter((f) => f.squadId === me.squadId).slice(0, limit) : []), [s, me?.squadId, limit]);
}

export function usePoolFunders(): { user: User; totalCents: Cents }[] {
  const s = useS();
  const me = useMe();
  return useMemo(() => {
    if (!me?.squadId) return [];
    const totals: Record<string, number> = {};
    for (const p of Object.values(s.penalties)) if (p.squadId === me.squadId) totals[p.userId] = (totals[p.userId] ?? 0) + p.amountCents;
    return Object.entries(totals).filter(([, c]) => c > 0).map(([id, totalCents]) => ({ user: s.users[id], totalCents }))
      .filter((x) => x.user).sort((a, b) => b.totalCents - a.totalCents);
  }, [s, me?.squadId]);
}

export function useOpenCashout(): CashoutProposal | null {
  const s = useS();
  const me = useMe();
  return me?.squadId ? openProposal(s, me.squadId) : null;
}

export function useBotThread(): BotThreadMessage[] {
  const s = useS();
  const id = useUserId();
  return useMemo(() => (id ? s.botThreads[id] ?? [] : []), [s, id]);
}

export function useDemoFlags(): DemoFlags {
  return useMockStore((s) => s.state.demo);
}
