// Charity rule (port of mock/engine.ts): a full pool the squad does not spend within the cash-out window goes to the
// squad's charity. The charities are fictional demo organisations (shared/charities.ts) and every donation is simulated.
// State lives in its own tables (squad_charity, donation, cashout_donate) so the original tables never had to change.
import { CASHOUT_WINDOW_DEMO_MS, CASHOUT_WINDOW_REAL_MS, DEFAULT_CHARITY_ID, charityById, isCharityId } from './shared/charities';
import { formatCents } from './shared/logic';
import type { Result } from './shared/types';
import { type Ctx, type Env, err, meOf, ok, pushFeed, uid } from './core';

export const charityWindowMs = (env: Env): number => (env.demoMode ? CASHOUT_WINDOW_DEMO_MS : CASHOUT_WINDOW_REAL_MS);

/** The squad's charity row, created with the default charity on first use. poolFullAt = -1 means "not full". */
export function charityRow(c: Ctx, squadId: string) {
  const r = c.db.squadCharity.squadId.find(squadId);
  if (r) return r;
  const row = { squadId, charityId: DEFAULT_CHARITY_ID, poolFullAt: -1 };
  c.db.squadCharity.insert(row);
  return row;
}

/** Starts the cash-out clock the first time the pool reaches its goal; stops it when the pool drops below. */
export function syncPoolFull(env: Env, squadId: string): void {
  const c = env.ctx;
  const sq = c.db.squad.id.find(squadId);
  if (!sq) return;
  const r = charityRow(c, squadId);
  const full = sq.poolGoalCents > 0 && sq.poolBalanceCents >= sq.poolGoalCents;
  if (full && r.poolFullAt < 0) c.db.squadCharity.squadId.update({ ...r, poolFullAt: env.now });
  if (!full && r.poolFullAt >= 0) c.db.squadCharity.squadId.update({ ...r, poolFullAt: -1 });
}

/** True while the clock runs: the pool goal cannot be changed to stall it (mock rule, audit M6). */
export function poolGoalLocked(c: Ctx, squadId: string): boolean {
  const sq = c.db.squad.id.find(squadId);
  const r = c.db.squadCharity.squadId.find(squadId);
  return !!sq && !!r && r.poolFullAt >= 0 && sq.poolBalanceCents >= sq.poolGoalCents;
}

export function donate(env: Env, squadId: string, reason: 'vote' | 'auto_deadline', amountCents: number, charityId?: string): void {
  const c = env.ctx;
  const sq = c.db.squad.id.find(squadId)!;
  const ch = charityById(charityId ?? charityRow(c, squadId).charityId);
  c.db.squad.id.update({ ...sq, poolBalanceCents: sq.poolBalanceCents - amountCents });
  c.db.donation.insert({ id: uid(env, 'd'), squadId, charityId: ch.id, amountCents, reason, createdAt: env.now });
  pushFeed(env, squadId, null, 'cashout',
    reason === 'vote'
      ? `The squad donated ${formatCents(amountCents)} to ${ch.name}. Flaking did some good.`
      : `Nobody spent the pool in time, so ${formatCents(amountCents)} went to ${ch.name}. Flaking did some good.`, env.now);
  const r = charityRow(c, squadId);
  c.db.squadCharity.squadId.update({ ...r, poolFullAt: -1 });
  syncPoolFull(env, squadId); // overflow can start the next clock right away
}

const openProposal = (c: Ctx, squadId: string) => [...c.db.cashout.squadId.filter(squadId)].find((p) => p.status === 'open');

export function setCharity(env: Env, charityId: string): Result<true> {
  const c = env.ctx;
  const me = meOf(env);
  if (!me?.squadId) return err('not_in_squad');
  if (!isCharityId(charityId)) return err('invalid_charity');
  const open = openProposal(c, me.squadId);
  if (open && c.db.cashoutDonate.cashoutId.find(open.id)) return err('charity_locked'); // do not change it under a vote
  const r = charityRow(c, me.squadId);
  if (r.charityId === charityId) return ok(true);
  c.db.squadCharity.squadId.update({ ...r, charityId });
  pushFeed(env, me.squadId, me.id, 'commit', `${me.name} set the squad charity to ${charityById(charityId).name}.`, env.now);
  return ok(true);
}

/** Opens a donation vote; the cash-out vote rules decide it (resolveVotes donates instead of spending). Returns the id. */
export function openDonationProposal(env: Env): Result<string> {
  const c = env.ctx;
  const me = meOf(env);
  if (!me?.squadId) return err('not_in_squad');
  const sq = c.db.squad.id.find(me.squadId)!;
  if (sq.poolBalanceCents < sq.poolGoalCents) return err('pool_not_ready');
  if (openProposal(c, sq.id)) return err('proposal_open');
  const ch = charityById(charityRow(c, sq.id).charityId);
  const id = uid(env, 'co');
  c.db.cashout.insert({ id, squadId: sq.id, proposerUserId: me.id, merchantName: ch.name, amountCents: sq.poolGoalCents, status: 'open', createdAt: env.now, nessiePurchaseId: '' });
  c.db.cashoutDonate.insert({ cashoutId: id, squadId: sq.id, charityId: ch.id });
  c.db.cashoutVote.insert({ id: `${id}:${me.id}`, proposalId: id, squadId: sq.id, userId: me.id, approve: true });
  pushFeed(env, sq.id, me.id, 'cashout', `${me.name} proposed donating ${formatCents(sq.poolGoalCents)} to ${ch.name}. Vote!`, env.now);
  return ok(id);
}

/** Scheduler: donate every pool whose cash-out window ran out with no vote in progress. Returns how many. */
export function settleCharity(env: Env): number {
  const c = env.ctx;
  let n = 0;
  for (const sq of [...c.db.squad.iter()]) {
    syncPoolFull(env, sq.id);
    const r = c.db.squadCharity.squadId.find(sq.id);
    if (!r || r.poolFullAt < 0 || env.now < r.poolFullAt + charityWindowMs(env)) continue;
    if (openProposal(c, sq.id)) continue; // the clock waits while the squad is voting
    const fresh = c.db.squad.id.find(sq.id)!;
    if (fresh.poolBalanceCents < fresh.poolGoalCents) continue;
    donate(env, sq.id, 'auto_deadline', fresh.poolGoalCents);
    n++;
  }
  return n;
}

/** Demo helper: pretend this squad's window already ran out and donate right away (only your own squad). */
export function demoExpirePoolDeadline(env: Env): Result<true> {
  const c = env.ctx;
  if (!env.demoMode) return err('not_available');
  const me = meOf(env);
  if (!me?.squadId) return err('not_in_squad');
  const sq = c.db.squad.id.find(me.squadId)!;
  if (sq.poolBalanceCents < sq.poolGoalCents) return err('pool_not_ready');
  if (openProposal(c, sq.id)) return err('proposal_open');
  donate(env, sq.id, 'auto_deadline', sq.poolGoalCents);
  return ok(true);
}
