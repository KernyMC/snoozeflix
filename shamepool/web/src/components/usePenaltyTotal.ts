'use client';
import { useLeaderboard, useMe } from '@/data';

/** Total money I have paid in penalties (from the leaderboard row, which already sums charged penalties). */
export function usePenaltyTotal(): number {
  const me = useMe();
  const rows = useLeaderboard();
  return rows.find((r) => r.user.id === me?.id)?.totalPaidCents ?? 0;
}
