import { beforeEach, describe, expect, it } from 'vitest';
import { buildBotContext } from './botContext';
import * as E from './engine';
import { makeSeed } from './seed';
import type { Ctx, MockState } from './state';

const NOON = new Date('2026-10-07T12:00:00-04:00').getTime();
const K = 'seed_kevin';
const AT = { lat: 42.2762, lng: -83.7357 };
let s: MockState;
const ctx = (userId: string | null = K, now = NOON): Ctx => ({ s, now, userId });
beforeEach(() => { s = makeSeed(NOON, 'weekly'); });

describe('askBot with an AI answer', () => {
  it('records the AI text and does not run the keyword router', () => {
    const r = E.askBot(ctx(), 'anything', { text: 'Kevin is the flake. Obviously.' });
    expect(r.ok && r.data.text).toBe('Kevin is the flake. Obviously.');
    const thread = s.botThreads[K];
    expect(thread.map((m) => m.from)).toEqual(['me', 'bot']);
  });
  it('turns a valid penalty action into a pending action, which still needs confirming', () => {
    const r = E.askBot(ctx(), 'make gym ten bucks', { text: 'Raise Gym to $10?', action: { goalTitle: 'gym', dollars: 10 } });
    const act = r.ok ? r.data.pendingAction : undefined;
    expect(act?.args).toMatchObject({ goalId: 'seed_goal_0', baseCents: 1000 });
    expect(s.goals.seed_goal_0.basePenaltyCents).toBe(500); // nothing changed yet
    expect(E.confirmBotAction(ctx(), act!.id).ok).toBe(true);
    expect(s.goals.seed_goal_0.basePenaltyCents).toBe(1000);
  });
  it('never trusts the model: unknown goals, out of range amounts, other people goals', () => {
    const unknown = E.askBot(ctx(), 'x', { text: 'Done!', action: { goalTitle: 'Skydiving', dollars: 10 } });
    expect(unknown.ok && unknown.data.pendingAction).toBeFalsy();
    expect(unknown.ok && unknown.data.text).toContain('nothing will change');
    const huge = E.askBot(ctx(), 'x', { text: 'Done!', action: { goalTitle: 'Gym', dollars: 900 } });
    expect(huge.ok && huge.data.pendingAction).toBeFalsy();
    const other = E.askBot(ctx('seed_ana'), 'x', { text: 'Done!', action: { goalTitle: 'Gym', dollars: 10 } }); // Gym belongs to Kevin
    expect(other.ok && other.data.pendingAction).toBeFalsy();
  });
  it('still validates the message', () => {
    expect(E.askBot(ctx(), '   ', { text: 'hi' })).toMatchObject({ ok: false, error: 'invalid_message' });
  });
});

describe('finishCheckin with a vision verdict', () => {
  const start = () => {
    const r = E.startCheckin(ctx(), 'seed_goal_0', AT);
    return r.ok ? r.data.id : '';
  };
  const finish = (id: string, ai?: Parameters<typeof E.finishCheckin>[3], at = NOON + 61_000) => E.finishCheckin(ctx(K, at), id, 'x'.repeat(20), ai);

  it('rejects when the AI says the photo is wrong, with its roast', () => {
    const id = start();
    const r = finish(id, { verified: false, confidence: 0.9, reason: 'A couch', roast: 'Comfy.' });
    expect(r).toMatchObject({ ok: false, error: 'photo_rejected' });
    expect(!r.ok && (r.meta?.verdict as { roast: string }).roast).toBe('Comfy.');
    expect(s.checkins[id].status).toBe('in_progress');
    expect(s.checkins[id].aiVerified).toBe(false);
  });
  it('fills in a roast when the model gave none', () => {
    const id = start();
    const r = finish(id, { verified: false, confidence: 0.9, reason: 'Nope', roast: null });
    expect(!r.ok && (r.meta?.verdict as { roast: string }).roast).toBeTruthy();
  });
  it('accepts a verified photo and keeps the AI reason', () => {
    const id = start();
    const r = finish(id, { verified: true, confidence: 0.95, reason: 'Dumbbells and racks', roast: null });
    expect(r.ok && r.data.verdict.reason).toBe('Dumbbells and racks');
    expect(s.checkins[id]).toMatchObject({ status: 'completed', aiVerified: true });
  });
  it('fails open, flagged, when the AI was unavailable (null)', () => {
    const id = start();
    const r = finish(id, null);
    expect(r.ok).toBe(true);
    expect(s.checkins[id]).toMatchObject({ status: 'completed', aiVerified: false, aiReason: 'AI check unavailable' });
  });
  it('a second outage on the same check-in is refused with ai_unavailable', () => {
    const id = start();
    s.checkins[id].aiUnavailableCount = 1; // already used the one free pass
    expect(finish(id, null)).toMatchObject({ ok: false, error: 'ai_unavailable' });
    expect(s.checkins[id].status).toBe('in_progress');
    expect(s.checkins[id].attempts).toBe(0); // the retry does not burn a photo attempt
  });
  it('keeps working without any AI (undefined)', () => {
    const id = start();
    expect(finish(id).ok).toBe(true);
  });
  it('three AI rejections fail the check-in', () => {
    const id = start();
    const no = { verified: false, confidence: 0.9, reason: 'No', roast: 'Nope' };
    finish(id, no, NOON + 61_000); finish(id, no, NOON + 62_000);
    expect(finish(id, no, NOON + 63_000)).toMatchObject({ ok: false, error: 'too_many_attempts' });
    expect(s.checkins[id].status).toBe('failed');
  });
  it('the demo "next photo fails" switch still wins over a good AI verdict', () => {
    const id = start();
    s.demo.nextPhotoFails = true;
    expect(finish(id, { verified: true, confidence: 1, reason: 'ok', roast: null })).toMatchObject({ ok: false, error: 'photo_rejected' });
  });
});

describe('bot context', () => {
  it('is small, readable and has no ids or secrets', () => {
    const c = buildBotContext(s, K, NOON)!;
    const json = JSON.stringify(c);
    expect(json.length).toBeLessThan(4000);
    expect(c.me).toMatchObject({ name: 'Kevin' });
    expect((c.squad as { pool: string }).pool).toBe('$35');
    expect((c.leaderboard as unknown[]).length).toBe(4);
    expect(json).not.toMatch(/seed_|passwordHash|inviteCode|PIZZA6/);
    expect((c.myGoals as { title: string }[]).map((g) => g.title)).toContain('Gym');
  });
  it('returns null without a squad', () => {
    const u = E.registerUser(ctx(null), { name: 'Solo', avatar: 'x' });
    expect(buildBotContext(s, u.ok ? u.data.id : '', NOON)).toBeNull();
  });
});
