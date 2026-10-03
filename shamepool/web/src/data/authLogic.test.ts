import { describe, expect, it } from 'vitest';
import {
  normalizeAnswer, passwordStrength, validateConfirm, validateEmail, validateFirstName, validatePassword, validateSecurity, validateUsername,
} from './authLogic';

describe('auth validators', () => {
  it('names', () => {
    expect(validateFirstName("Mary-Ann O'Neil")).toBeNull();
    expect(validateFirstName('  ')).toBe('invalid_first_name');
    expect(validateFirstName('R2D2')).toBe('invalid_first_name');
  });
  it('email', () => {
    expect(validateEmail('jane@example.com')).toBeNull();
    for (const bad of ['', 'jane', 'jane@', 'a@b', 'a b@c.com']) expect(validateEmail(bad)).toBe('invalid_email');
  });
  it('username', () => {
    expect(validateUsername('jane_doe1')).toBeNull();
    for (const bad of ['ab', 'a'.repeat(21), 'has space', 'no-dash']) expect(validateUsername(bad)).toBe('invalid_username');
  });
  it('password + confirm', () => {
    expect(validatePassword('abcdefg1')).toBeNull();
    for (const bad of ['short1', 'allletters', '12345678']) expect(validatePassword(bad)).toBe('weak_password');
    expect(validateConfirm('a', 'a')).toBeNull();
    expect(validateConfirm('a', 'b')).toBe('password_mismatch');
  });
  it('strength', () => {
    expect(passwordStrength('')).toBe(0);
    expect(passwordStrength('abc')).toBe(1);
    expect(passwordStrength('Abcdefg1!')).toBe(4);
  });
  it('security questions', () => {
    const ok = [{ qId: 'pet', answer: 'Rex' }, { qId: 'city', answer: 'Ann Arbor' }, { qId: 'car', answer: 'Honda' }];
    expect(validateSecurity(ok)).toBeNull();
    expect(validateSecurity([ok[0], ok[0], ok[2]])).toBe('invalid_security'); // duplicate question
    expect(validateSecurity([ok[0], ok[1], { qId: 'car', answer: 'x' }])).toBe('invalid_security'); // too short
    expect(validateSecurity(ok.slice(0, 2))).toBe('invalid_security');
    expect(validateSecurity([ok[0], ok[1], { qId: 'nope', answer: 'Honda' }])).toBe('invalid_security');
  });
  it('normalizes answers', () => expect(normalizeAnswer('  Ann   ARBOR ')).toBe('ann arbor'));
});
