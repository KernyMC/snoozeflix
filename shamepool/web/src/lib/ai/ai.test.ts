import { describe, expect, it } from 'vitest';
import { SYSTEM_PROMPT, cleanMessage, contextJson, looksLikePenaltyRequest, parseAssistant, trimHistory } from './chat';
import { COACH_PROMPT } from './coach';
import { normalizeCoach, parseJsonObject } from './coach';
import { parseVerdict } from './verdict';

describe('chat helpers', () => {
  it('keeps the last 6 valid turns, short', () => {
    const h = Array.from({ length: 9 }, (_, i) => ({ from: i % 2 ? 'bot' : 'me', text: `msg ${i} ${'x'.repeat(400)}` }));
    const out = trimHistory([...h, { from: 'evil', text: 'nope' }, { from: 'me', text: 5 }]);
    expect(out).toHaveLength(6);
    expect(out.every((t) => t.content.length <= 300)).toBe(true);
    expect(out.map((t) => t.role)).toEqual(expect.arrayContaining(['user', 'assistant']));
    expect(trimHistory('nope')).toEqual([]);
  });
  it('rejects missing, array and oversized context', () => {
    expect(contextJson({ a: 1 })).toBe('{"a":1}');
    expect(contextJson(null)).toBeNull();
    expect(contextJson([1])).toBeNull();
    expect(contextJson({ big: 'x'.repeat(10_000) })).toBeNull();
  });
  it('cleans and caps the message', () => {
    expect(cleanMessage('  hello   world ')).toBe('hello world');
    expect(cleanMessage('x'.repeat(900))).toHaveLength(400);
    expect(cleanMessage(42)).toBe('');
  });
  it('parses plain text and strips markdown', () => {
    expect(parseAssistant({ content: '**Kevin** is flaking.' })).toEqual({ text: 'Kevin is flaking.', action: null });
    expect(parseAssistant({ content: '   ' })).toBeNull();
    expect(parseAssistant(undefined)).toBeNull();
  });
  it('parses a valid penalty tool call and writes text when the model sent none', () => {
    const r = parseAssistant({ content: '', tool_calls: [{ function: { name: 'propose_penalty_change', arguments: '{"goal_title":"Gym","dollars":10}' } }] });
    expect(r?.action).toEqual({ goalTitle: 'Gym', dollars: 10 });
    expect(r?.text).toContain('Gym');
  });
  it('ignores invalid tool calls', () => {
    const bad = (args: string, name = 'propose_penalty_change') => parseAssistant({ content: 'ok', tool_calls: [{ function: { name, arguments: args } }] });
    expect(bad('{"goal_title":"Gym","dollars":500}')?.action).toBeNull();
    expect(bad('{"goal_title":"Gym","dollars":0}')?.action).toBeNull();
    expect(bad('{"goal_title":"","dollars":5}')?.action).toBeNull();
    expect(bad('not json')?.action).toBeNull();
    expect(bad('{"goal_title":"Gym","dollars":5}', 'transfer_money')?.action).toBeNull();
  });
});

describe('verdict parsing', () => {
  it('accepts a clean verified answer', () => {
    expect(parseVerdict('{"verified":true,"confidence":0.9,"reason":"Dumbbells and racks","roast":"ignore me"}'))
      .toEqual({ verified: true, confidence: 0.9, reason: 'Dumbbells and racks', roast: null });
  });
  it('handles code fences and extra text', () => {
    expect(parseVerdict('```json\n{"verified":false,"confidence":0.8,"reason":"A couch","roast":"Comfy."}\n```')?.roast).toBe('Comfy.');
    expect(parseVerdict('Sure! {"verified":true,"confidence":0.7,"reason":"ok"}')?.verified).toBe(true);
  });
  it('turns an unsure "yes" into a rejection', () => {
    const v = parseVerdict('{"verified":true,"confidence":0.3,"reason":"maybe"}');
    expect(v?.verified).toBe(false);
    expect(v?.roast).toBeTruthy();
  });
  it('always gives a roast when rejecting', () => {
    expect(parseVerdict('{"verified":false,"confidence":0.9,"reason":"no"}')?.roast).toBeTruthy();
  });
  it('returns null for garbage', () => {
    expect(parseVerdict('')).toBeNull();
    expect(parseVerdict('hello')).toBeNull();
    expect(parseVerdict('{"confidence":1}')).toBeNull();
    expect(parseVerdict(null)).toBeNull();
  });
});

describe('coach plan', () => {
  const good = { title: 'Gym after class', icon: 'goal-gym', days: [1, 3, 5, 3], deadline: '17:30', minStayMinutes: 45, basePenaltyDollars: 8, radiusM: 120, tip: 'Start small.' };
  it('normalizes a good plan', () => {
    expect(normalizeCoach(good)).toMatchObject({ title: 'Gym after class', icon: 'goal-gym', days: [1, 3, 5], deadlineMinutes: 17 * 60 + 30, minStayMinutes: 45, basePenaltyCents: 800, radiusM: 120 });
  });
  it('clamps wild values and falls back on bad ones', () => {
    const p = normalizeCoach({ ...good, minStayMinutes: 9999, basePenaltyDollars: 1000, radiusM: 5, icon: 'rocket', deadline: '25:99' });
    expect(p).toMatchObject({ minStayMinutes: 180, basePenaltyCents: 4000, radiusM: 50, icon: 'goal-target', deadlineMinutes: 18 * 60 });
  });
  it('rejects plans without a title or valid days', () => {
    expect(normalizeCoach({ ...good, title: ' ' })).toBeNull();
    expect(normalizeCoach({ ...good, days: [9, -1, 'x'] })).toBeNull();
    expect(normalizeCoach(null)).toBeNull();
    expect(normalizeCoach('x')).toBeNull();
  });
  it('parses JSON wrapped in fences', () => {
    expect(parseJsonObject('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseJsonObject('nope')).toBeNull();
  });
});

describe('penalty request gate', () => {
  it('accepts real penalty requests', () => {
    for (const m of ['make my gym penalty twelve bucks', 'raise the penalty on Gym to $10', 'set gym to 15', 'bajar la multa de gym a 5', 'change my run penalty to ten dollars']) {
      expect(looksLikePenaltyRequest(m)).toBe(true);
    }
  });
  it('rejects everything else, in any language', () => {
    for (const m of ['quien va ganando?', "who's flaking the most?", 'how close are we to pizza?', 'what is due today', 'am I broke?', 'make me laugh', 'set the mood']) {
      expect(looksLikePenaltyRequest(m)).toBe(false);
    }
  });
});

describe('language', () => {
  it('forces English replies from the bot and the coach', () => {
    expect(SYSTEM_PROMPT).toContain('Always reply in English');
    expect(COACH_PROMPT).toContain('in English');
  });
});
