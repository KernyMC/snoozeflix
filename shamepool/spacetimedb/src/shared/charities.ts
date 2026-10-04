// GENERATED COPY of web/src/data/charities.ts. Do not edit; run: node scripts/sync-shared.mjs
/** Demo charities (fictional, generic names). In the demo every donation is simulated. */
export type CharityKind = 'food' | 'water' | 'animals' | 'kids' | 'disaster';

export interface Charity { id: string; name: string; blurb: string; kind: CharityKind }

export const CHARITIES: Charity[] = [
  { id: 'food-bank', name: 'Local Food Bank', blurb: 'Turns your friends’ flakes into groceries for families nearby.', kind: 'food' },
  { id: 'clean-water', name: 'Clean Water Fund', blurb: 'Funds wells and filters so more people have safe drinking water.', kind: 'water' },
  { id: 'animal-shelter', name: 'Animal Shelter Network', blurb: 'Food, vet care and warm beds for rescued pets.', kind: 'animals' },
  { id: 'kids-sports', name: 'Kids Sports Fund', blurb: 'Gear and fees so kids can play, which is the exercise you skipped.', kind: 'kids' },
  { id: 'disaster-relief', name: 'Disaster Relief Fund', blurb: 'Fast help for communities after floods, fires and storms.', kind: 'disaster' },
];

export const DEFAULT_CHARITY_ID = 'food-bank';

export function charityById(id: string | null | undefined): Charity {
  return CHARITIES.find((c) => c.id === id) ?? CHARITIES[0];
}
export const isCharityId = (id: unknown): id is string => typeof id === 'string' && CHARITIES.some((c) => c.id === id);

/** Days the squad has to spend a full pool before it goes to its charity (shortened in demo builds). */
export const CASHOUT_WINDOW_REAL_MS = 7 * 24 * 3600_000;
export const CASHOUT_WINDOW_DEMO_MS = 3 * 60_000;
