import { describe, expect, it } from 'vitest';
import { MAX_SPEECH_CHARS, sanitizeSpeech } from './speech';

describe('sanitizeSpeech', () => {
  it('strips emojis, mentions, links and markdown', () => {
    expect(sanitizeSpeech('@squadbot Kevin flaked 💸 on **Gym** https://x.co/a')).toBe('Kevin flaked on Gym');
  });
  it('reads money as words', () => {
    expect(sanitizeSpeech('$10 to the pool, $2.50 left')).toBe('10 dollars to the pool, 2.50 dollars left');
  });
  it('returns empty for non-strings and unspeakable text', () => {
    expect(sanitizeSpeech(undefined)).toBe('');
    expect(sanitizeSpeech(42)).toBe('');
    expect(sanitizeSpeech('🔥🔥🔥')).toBe('');
    expect(sanitizeSpeech('   ')).toBe('');
  });
  it('caps length at a word boundary', () => {
    const long = 'word '.repeat(200);
    const out = sanitizeSpeech(long);
    expect(out.length).toBeLessThanOrEqual(MAX_SPEECH_CHARS);
    expect(out.endsWith('word')).toBe(true);
  });
});
