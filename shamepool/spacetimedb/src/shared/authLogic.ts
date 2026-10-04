// GENERATED COPY of web/src/data/authLogic.ts. Do not edit; run: node scripts/sync-shared.mjs
import type { ErrorCode } from './types';

export const SECURITY_QUESTIONS: { id: string; text: string }[] = [
  { id: 'pet', text: 'What was the name of your first pet?' },
  { id: 'city', text: 'What city were you born in?' },
  { id: 'maiden', text: "What is your mother's maiden name?" },
  { id: 'school', text: 'What was the name of your elementary school?' },
  { id: 'car', text: 'What was the make of your first car?' },
  { id: 'nickname', text: 'What was your childhood nickname?' },
  { id: 'street', text: 'What is the name of the street you grew up on?' },
  { id: 'team', text: 'What is your favorite sports team?' },
];

const NAME_RE = /^[\p{L}][\p{L} '-]*$/u;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const USERNAME_RE = /^[a-z0-9_]{3,20}$/i;

export const validateFirstName = (v: string): ErrorCode | null => {
  const t = v.trim();
  return t.length >= 1 && t.length <= 30 && NAME_RE.test(t) ? null : 'invalid_first_name';
};
export const validateLastName = (v: string): ErrorCode | null => {
  const t = v.trim();
  return t.length >= 1 && t.length <= 30 && NAME_RE.test(t) ? null : 'invalid_last_name';
};
export const validateEmail = (v: string): ErrorCode | null => {
  const t = v.trim();
  return t.length <= 254 && EMAIL_RE.test(t) ? null : 'invalid_email';
};
export const validateUsername = (v: string): ErrorCode | null => (USERNAME_RE.test(v.trim()) ? null : 'invalid_username');
export const validatePassword = (v: string): ErrorCode | null =>
  v.length >= 8 && v.length <= 72 && /[A-Za-z]/.test(v) && /\d/.test(v) ? null : 'weak_password';
export const validateConfirm = (pw: string, confirm: string): ErrorCode | null => (pw === confirm ? null : 'password_mismatch');

/** Case/space-insensitive so "  Rex " matches "rex". */
export const normalizeAnswer = (v: string): string => v.trim().toLowerCase().replace(/\s+/g, ' ');

export function validateSecurity(items: { qId: string; answer: string }[]): ErrorCode | null {
  if (items.length !== 3) return 'invalid_security';
  const ids = new Set(items.map((i) => i.qId));
  if (ids.size !== 3 || ![...ids].every((id) => SECURITY_QUESTIONS.some((q) => q.id === id))) return 'invalid_security';
  return items.every((i) => {
    const n = normalizeAnswer(i.answer).length;
    return n >= 2 && n <= 50;
  }) ? null : 'invalid_security';
}

/** 0 (empty) – 4 (strong). */
export function passwordStrength(pw: string): 0 | 1 | 2 | 3 | 4 {
  if (!pw) return 0;
  let n = 0;
  if (pw.length >= 8) n++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) n++;
  if (/\d/.test(pw)) n++;
  if (/[^A-Za-z0-9]/.test(pw) || pw.length >= 12) n++;
  return Math.max(1, n) as 1 | 2 | 3 | 4;
}
