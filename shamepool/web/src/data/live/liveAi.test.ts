import { describe, expect, it } from 'vitest';
import { aiBotArgs, aiVerdictArgs } from './aiArgs';
import { buildLiveBotContext } from './botContext';
import type { LiveState } from './stdb';

describe('AI arguments for the live procedures', () => {
  it('maps no AI, AI down and a verdict to aiMode', () => {
    expect(aiVerdictArgs(undefined).aiMode).toBe('none');
    expect(aiVerdictArgs(null).aiMode).toBe('unavailable');
    const v = aiVerdictArgs({ verified: false, confidence: 0.91, reason: 'That is a couch', roast: 'Comfy flake.' });
    expect(v).toEqual({ aiMode: 'verdict', verdict: { verified: false, confidence: 0.91, reason: 'That is a couch', roast: 'Comfy flake.' } });
  });
  it('clamps text and fills defaults the procedure needs', () => {
    const v = aiVerdictArgs({ verified: true, confidence: Number.NaN, reason: 'x'.repeat(300), roast: null });
    expect(v.verdict.confidence).toBe(0.7);
    expect(v.verdict.reason).toHaveLength(120);
    expect(v.verdict.roast).toBe('');
  });
  it('flattens the bot answer and its optional penalty action', () => {
    expect(aiBotArgs({ text: 'Pool is $5' })).toEqual({ aiText: 'Pool is $5', hasAction: false, goalTitle: '', dollars: 0 });
    expect(aiBotArgs({ text: 'Sure', action: { goalTitle: 'Gym', dollars: 10 } })).toEqual({ aiText: 'Sure', hasAction: true, goalTitle: 'Gym', dollars: 10 });
  });
});

describe('live bot context', () => {
  const now = Date.UTC(2026, 9, 4, 16, 0); // Sunday noon in Detroit
  const base: LiveState = {
    status: 'ready', users: [], squads: [], owners: [], goals: [], checkins: [], penalties: [], feed: [], cashouts: [], votes: [], withdrawals: [], flags: null,
    fakeLocation: null, squadSynced: 'sq', me: null, account: null, plan: null, addresses: [], payments: [], bot: [],
  };
  const me = { id: 'u1', name: 'Eve', avatar: 'a', squadId: 'sq', balanceCents: 19500, isSeed: false };
  const state: LiveState = {
    ...base, me, users: [me, { ...me, id: 'u2', name: 'Bo', balanceCents: 20000 }],
    squads: [{ id: 'sq', name: 'Crew', inviteCode: 'ABC123', poolGoalName: 'Pizza', poolGoalCents: 2000, poolBalanceCents: 500, timezone: 'America/Detroit', relayLinked: false }],
    goals: [{
      id: 'g1', userId: 'u1', squadId: 'sq', title: 'Gym', emoji: 'goal-gym', lat: 1, lng: 2, radiusM: 150, days: [0, 1, 2, 3, 4, 5, 6], deadlineMinutes: 23 * 60,
      minStayMinutes: 1, basePenaltyCents: 500, maxPenaltyCents: 4000, consecutiveFlakes: 0, streak: 2, active: true, createdAt: now - 86_400_000, lastEvaluatedDate: '',
    }],
    feed: [{ id: 'f1', seq: 1, squadId: 'sq', actorUserId: 'u2', kind: 'message', text: 'hi', createdAt: now - 1000, metaJson: '' }],
  };
  it('is null without a user or a squad', () => {
    expect(buildLiveBotContext(base, now)).toBeNull();
    expect(buildLiveBotContext({ ...state, me: { ...me, squadId: '' } }, now)).toBeNull();
  });
  it('describes me, the squad, my goals, the leaderboard and the feed with formatted money', () => {
    const c = buildLiveBotContext(state, now) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(c.me).toMatchObject({ name: 'Eve', balance: '$195' });
    expect(c.squad).toMatchObject({ name: 'Crew', pool: '$5', poolGoal: '$20', members: 2 });
    expect(c.myGoals[0]).toMatchObject({ title: 'Gym', state: 'due today', nextMissCosts: '$5' });
    expect(c.leaderboard).toHaveLength(2);
    expect(c.recentFeed).toEqual(['hi']);
    expect(JSON.stringify(c).length).toBeLessThan(9000); // the chat route caps context at 9 KB
  });
});
