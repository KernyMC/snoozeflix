import { beforeEach, describe, expect, it } from 'vitest';
import * as E from './engine';
import { makeSeed } from './seed';
import type { Ctx, MockState } from './state';

// Wed 2026-10-07 12:00 America/Detroit
const NOON = new Date('2026-10-07T12:00:00-04:00').getTime();
let s: MockState;
const ctx = (userId = 'seed_kevin', now = NOON): Ctx => ({ s, now, userId });
const say = (text: string, user = 'seed_kevin', now = NOON) => {
  const r = E.askBot(ctx(user, now), text);
  return r.ok ? r.data : { text: '', pendingAction: undefined };
};

beforeEach(() => { s = makeSeed(NOON, 'weekly'); });

describe('bot intents', () => {
  it('answers balance', () => {
    const r = say('what is my balance?');
    expect(r.text).toContain('You have');
    expect(r.text).toContain('Gym');
  });
  it('says who is winning', () => {
    expect(say('who is winning?').text).toMatch(/is on top/);
    expect(say("who's the leader").text).toMatch(/is on top/);
  });
  it('lists what is due and when', () => {
    const r = say('what is due today?');
    expect(r.text).toMatch(/is due in|Nothing is due/);
    const late = new Date('2026-10-07T23:30:00-04:00').getTime();
    expect(say('what is due today?', 'seed_kevin', late).text).toContain('Nothing is due');
  });
  it('greets and explains itself', () => {
    expect(say('hey').text).toContain('Ask me');
    expect(say('help').text).toContain('Ask me');
  });
  it('keeps the older intents working', () => {
    expect(say('how close are we to pizza?').text).toContain('$35 of $60');
    expect(say('who is flaking the most?').text).toMatch(/Flake of the Week|flaked/);
    expect(say('raise my gym penalty to $10').pendingAction).toBeTruthy();
  });
  it('falls back politely', () => {
    expect(say('blah blah').text).toContain('I can answer');
  });
});
