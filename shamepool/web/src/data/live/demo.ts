// Pure rules for demo controls on the shared live database. Kept out of actions.ts so they can be unit tested.
import type { DemoFlags, Pos } from '../types';

export interface DemoPlan {
  /** true when the patch asks for something the shared database does not allow from a browser (moving the clock). */
  refuse: boolean;
  /** New per-tab fake location (null = off), or undefined when the patch does not touch it. */
  fake?: Pos | null;
  /** Value to send to the module, or undefined when the patch does not touch it. */
  nextPhotoFails?: boolean;
}

/**
 * Splits a demo patch into what stays in this tab (fake location), what goes to Spacetime (next photo fails) and what
 * is refused (any clock change: the clock is global and the scheduler would charge every squad). Setting the clock to
 * its current value is a no-op, so "Reset clock" at 0 stays harmless.
 */
export function planDemoPatch(patch: Partial<DemoFlags>, currentOffsetMs: number): DemoPlan {
  if (patch.timeOffsetMs !== undefined && patch.timeOffsetMs !== currentOffsetMs) return { refuse: true };
  const plan: DemoPlan = { refuse: false };
  if ('fakeLocation' in patch) plan.fake = patch.fakeLocation ?? null;
  if (patch.nextPhotoFails !== undefined) plan.nextPhotoFails = patch.nextPhotoFails;
  return plan;
}
