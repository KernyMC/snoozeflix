'use client';
// Live hooks: same names and shapes as mock/hooks.ts. Derived values (leaderboard, wallet, funders) are computed
// client-side from the subscribed rows with the shared pure logic in ../logic.
import { useEffect, useMemo, useState } from 'react';
import {
  availableToWithdraw, buildLeaderboard, DEFAULT_TZ, localDate, MIN_WITHDRAW_CENTS, penaltyKey, stakeBreakdown, WITHDRAW_COOLDOWN_DEMO_MS,
  WITHDRAW_COOLDOWN_REAL_MS,
} from '../logic';
import type {
  AccountInfo, Billing, BotThreadMessage, CashoutProposal, Cents, Checkin, DemoFlags, FeedEvent, Goal, LeaderboardRow, Penalty, Pos, Squad, User, Wallet, Withdrawal,
} from '../types';
import {
  accountInfoOf, billingOf, botMessageOf, cashoutOf, checkinOf, feedOf, goalOf, penaltyOf, squadOf, userOf, withdrawalOf, type UserRow,
} from './mappers';
import { useLive } from './stdb';

const EMPTY_BILLING: Billing = { tier: 'free', payments: [], addresses: [] };

/** Wall-clock respecting the demo time offset; re-renders every `intervalMs`. */
export function useNow(intervalMs = 1000): number {
  const offset = useLive((s) => s.flags?.timeOffsetMs ?? 0);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  void tick;
  return Date.now() + offset;
}

export function useConnection(): { status: 'connecting' | 'ready' | 'error'; mode: 'mock' | 'live' } {
  const status = useLive((s) => s.status);
  return { status, mode: 'live' };
}

/**
 * undefined = loading, null = no identity. A user with a squad stays "loading" until that squad's rows are synced, so
 * screens never see a half-loaded squad (empty feed or leaderboard) that later fills in as if it were new activity.
 */
export function useMe(): User | null | undefined {
  const status = useLive((s) => s.status);
  const row = useLive((s) => s.me);
  const synced = useLive((s) => s.squadSynced);
  return useMemo(() => meState(status, row, synced), [status, row, synced]);
}
export function meState(status: string, row: UserRow | null, squadSynced: string): User | null | undefined {
  if (status !== 'ready') return undefined;
  if (!row) return null;
  if (row.squadId && row.squadId !== squadSynced) return undefined;
  return userOf(row);
}

export function useAccount(): AccountInfo | null {
  const row = useLive((s) => s.account);
  return useMemo(() => (row ? accountInfoOf(row) : null), [row]);
}

export function useBilling(): Billing {
  const plan = useLive((s) => s.plan);
  const payments = useLive((s) => s.payments);
  const addresses = useLive((s) => s.addresses);
  return useMemo(() => (!plan && !payments.length && !addresses.length ? EMPTY_BILLING : billingOf(plan ?? undefined, payments, addresses)), [plan, payments, addresses]);
}

const useSquadId = () => useLive((s) => s.me?.squadId ?? '');

export function useSquad(): Squad | null {
  const id = useSquadId();
  const squads = useLive((s) => s.squads);
  const owners = useLive((s) => s.owners);
  return useMemo(() => {
    const r = id ? squads.find((q) => q.id === id) : undefined;
    return r ? { ...squadOf(r), ownerUserId: owners.find((o) => o.squadId === r.id)?.userId ?? null } : null;
  }, [id, squads, owners]);
}

export function useSquadMembers(): User[] {
  const id = useSquadId();
  const users = useLive((s) => s.users);
  return useMemo(() => (id ? users.filter((u) => u.squadId === id).map(userOf) : []), [id, users]);
}

export function useMyGoals(): Goal[] {
  const meId = useLive((s) => s.me?.id ?? '');
  const goals = useLive((s) => s.goals);
  return useMemo(() => goals.filter((g) => g.userId === meId && g.active).map(goalOf).sort((a, b) => a.createdAt - b.createdAt), [goals, meId]);
}

export function useGoal(goalId: string): Goal | null {
  const goals = useLive((s) => s.goals);
  return useMemo(() => {
    const g = goals.find((x) => x.id === goalId);
    return g ? goalOf(g) : null;
  }, [goals, goalId]);
}

export function useGoalHistory(goalId: string): { checkins: Checkin[]; penalties: Penalty[] } {
  const checkins = useLive((s) => s.checkins);
  const penalties = useLive((s) => s.penalties);
  return useMemo(() => ({
    checkins: checkins.filter((c) => c.goalId === goalId && c.status === 'completed').map(checkinOf).sort((a, b) => b.localDate.localeCompare(a.localDate)),
    penalties: penalties.filter((p) => p.goalId === goalId).map(penaltyOf).sort((a, b) => b.localDate.localeCompare(a.localDate)),
  }), [checkins, penalties, goalId]);
}

export function useActiveCheckin(goalId: string): Checkin | null {
  const checkins = useLive((s) => s.checkins);
  return useMemo(() => {
    const c = checkins.find((x) => x.goalId === goalId && x.status === 'in_progress');
    return c ? checkinOf(c) : null;
  }, [checkins, goalId]);
}

export function useLeaderboard(): LeaderboardRow[] {
  const squadId = useSquadId();
  const users = useLive((s) => s.users);
  const goals = useLive((s) => s.goals);
  const checkins = useLive((s) => s.checkins);
  const penalties = useLive((s) => s.penalties);
  const squads = useLive((s) => s.squads);
  const now = useNow(30_000);
  return useMemo(() => {
    if (!squadId) return [];
    const members = users.filter((u) => u.squadId === squadId);
    const ids = new Set(members.map((m) => m.id));
    const tz = squads.find((q) => q.id === squadId)?.timezone ?? DEFAULT_TZ;
    return buildLeaderboard(
      members.map(userOf), goals.filter((g) => ids.has(g.userId)).map(goalOf), checkins.filter((c) => ids.has(c.userId)).map(checkinOf),
      penalties.filter((p) => p.squadId === squadId).map(penaltyOf), now, tz,
    );
  }, [squadId, users, goals, checkins, penalties, squads, now]);
}

export function useFeed(limit = 50): FeedEvent[] {
  const squadId = useSquadId();
  const feed = useLive((s) => s.feed);
  return useMemo(() => (squadId
    ? feed.filter((f) => f.squadId === squadId).sort((a, b) => b.createdAt - a.createdAt || b.seq - a.seq).slice(0, limit).map(feedOf)
    : []), [squadId, feed, limit]);
}

export function usePoolFunders(): { user: User; totalCents: Cents }[] {
  const squadId = useSquadId();
  const users = useLive((s) => s.users);
  const penalties = useLive((s) => s.penalties);
  return useMemo(() => {
    if (!squadId) return [];
    const totals: Record<string, number> = {};
    for (const p of penalties) if (p.squadId === squadId) totals[p.userId] = (totals[p.userId] ?? 0) + p.amountCents;
    return Object.entries(totals).filter(([, c]) => c > 0)
      .map(([id, totalCents]) => ({ row: users.find((u) => u.id === id), totalCents }))
      .filter((x): x is { row: NonNullable<typeof x.row>; totalCents: number } => !!x.row)
      .map((x) => ({ user: userOf(x.row), totalCents: x.totalCents }))
      .sort((a, b) => b.totalCents - a.totalCents);
  }, [squadId, users, penalties]);
}

export function useOpenCashout(): CashoutProposal | null {
  const squadId = useSquadId();
  const cashouts = useLive((s) => s.cashouts);
  const votes = useLive((s) => s.votes);
  return useMemo(() => {
    const p = squadId ? cashouts.find((c) => c.squadId === squadId && c.status === 'open') : undefined;
    return p ? cashoutOf(p, votes) : null;
  }, [squadId, cashouts, votes]);
}

export function useBotThread(): BotThreadMessage[] {
  const bot = useLive((s) => s.bot);
  return useMemo(() => [...bot].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id)).map(botMessageOf), [bot]);
}

/**
 * Module flags (shared by everyone) merged with this tab's own fake location. The module's global fake location is
 * ignored on purpose: one user's "pretend I'm there" must not move every other user on the shared database.
 */
export function demoFlagsOf(
  f: { nextPhotoFails: boolean; timeOffsetMs: number } | null,
  localFake: Pos | null = null,
): DemoFlags {
  return { nextPhotoFails: f?.nextPhotoFails ?? false, timeOffsetMs: f?.timeOffsetMs ?? 0, fakeLocation: localFake };
}
export function useDemoFlags(): DemoFlags {
  const f = useLive((s) => s.flags);
  const fake = useLive((s) => s.fakeLocation);
  return useMemo(() => demoFlagsOf(f, fake), [f, fake]);
}

export function useWallet(): Wallet | null {
  const me = useLive((s) => s.me);
  const goals = useLive((s) => s.goals);
  const checkins = useLive((s) => s.checkins);
  const penalties = useLive((s) => s.penalties);
  const withdrawals = useLive((s) => s.withdrawals);
  const squads = useLive((s) => s.squads);
  const demo = useLive((s) => s.flags?.demoMode ?? true);
  const now = useNow(15_000);
  return useMemo(() => {
    if (!me) return null;
    const tz = squads.find((q) => q.id === me.squadId)?.timezone ?? DEFAULT_TZ;
    const today = localDate(now, tz);
    const mine = goals.filter((g) => g.userId === me.id && g.active).map(goalOf);
    const handled = (goalId: string) =>
      checkins.some((c) => c.goalId === goalId && c.localDate === today && c.status === 'completed') ||
      penalties.some((p) => p.key === penaltyKey(goalId, today));
    const stake = stakeBreakdown(mine, now, tz, handled);
    const stakeCents = stake.reduce((a, x) => a + x.cents, 0);
    const pendingCents = withdrawals.filter((w) => w.userId === me.id && w.status === 'pending').reduce((a, w) => a + w.amountCents, 0);
    return {
      balanceCents: me.balanceCents, stakeCents, availableCents: availableToWithdraw(me.balanceCents, stakeCents), pendingCents, stake,
      minWithdrawCents: MIN_WITHDRAW_CENTS, cooldownMs: demo ? WITHDRAW_COOLDOWN_DEMO_MS : WITHDRAW_COOLDOWN_REAL_MS,
    };
  }, [me, goals, checkins, penalties, withdrawals, squads, demo, now]);
}

export function useWithdrawals(): Withdrawal[] {
  const meId = useLive((s) => s.me?.id ?? '');
  const withdrawals = useLive((s) => s.withdrawals);
  return useMemo(() => withdrawals.filter((w) => w.userId === meId).map(withdrawalOf).sort((a, b) => b.createdAt - a.createdAt), [withdrawals, meId]);
}
