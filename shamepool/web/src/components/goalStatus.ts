'use client';
import { deadlinePassed, isDueToday, localDate, msUntilDeadline, useGoalHistory, useNow, useSquad, type Goal } from '@/data';

export type GoalState = 'done' | 'flaked' | 'due' | 'late' | 'rest';

/** Derived status of a goal for "today" in the squad timezone. */
export function useGoalStatus(goal: Goal) {
  const squad = useSquad();
  const tz = squad?.timezone ?? 'America/Detroit';
  const now = useNow(15_000);
  const { checkins, penalties } = useGoalHistory(goal.id);
  const today = localDate(now, tz);
  const done = checkins.some((c) => c.localDate === today && c.status === 'completed');
  const flaked = penalties.some((p) => p.localDate === today);
  const scheduled = isDueToday(goal, now, tz);
  const passed = deadlinePassed(goal, now, tz);
  const msLeft = msUntilDeadline(goal, now, tz);
  let state: GoalState = 'rest';
  if (done) state = 'done';
  else if (flaked) state = 'flaked';
  else if (scheduled && passed) state = 'late';
  else if (scheduled) state = 'due';
  return { state, msLeft, tz, today, now, urgent: state === 'due' && msLeft < 2 * 3600_000 };
}

export const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
