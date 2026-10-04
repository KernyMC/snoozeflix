import {
  normalizeAnswer, SECURITY_QUESTIONS, validateConfirm, validateEmail, validateFirstName, validateLastName, validatePassword,
  validateSecurity, validateUsername,
} from '../authLogic';
import type { Account, RegisterInput, Result, User } from '../types';
import { type Ctx, err, ok, uid } from './state';

const MAX_FAILS = 5;
const LOCK_MS = 30_000;
const RESET_TTL_MS = 10 * 60_000;

// Mock-only hash. The real backend must use a proper password KDF (argon2/bcrypt) and hash answers too.
export const hash = (str: string) => [...str].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) | 0, 7);
const key = (username: string) => username.trim().toLowerCase();

function locked(c: Ctx, k: string): boolean {
  const a = c.s.authAttempts[k];
  return !!a && a.until > c.now;
}
function fail(c: Ctx, k: string): void {
  const a = c.s.authAttempts[k] ?? { n: 0, until: 0 };
  a.n = a.until && a.until <= c.now ? 1 : a.n + 1;
  a.until = a.n >= MAX_FAILS ? c.now + LOCK_MS : 0;
  c.s.authAttempts[k] = a;
}
const clear = (c: Ctx, k: string) => { delete c.s.authAttempts[k]; };

export function registerAccount(c: Ctx, i: RegisterInput): Result<User> {
  const bad = validateFirstName(i.firstName) ?? validateLastName(i.lastName) ?? validateEmail(i.email) ?? validateUsername(i.username)
    ?? validatePassword(i.password) ?? validateConfirm(i.password, i.confirm) ?? validateSecurity(i.security);
  if (bad) return err(bad);
  const k = key(i.username);
  if (c.s.accounts[k]) return err('username_taken');
  const email = i.email.trim().toLowerCase();
  if (Object.values(c.s.accounts).some((a) => a.email === email)) return err('email_taken');
  const u: User = { id: uid(c.s, 'u'), name: i.username.trim(), avatar: '/assets/avatar/01-coin-thief.png', squadId: null, balanceCents: 20000 };
  c.s.users[u.id] = u;
  const acct: Account = {
    userId: u.id, username: i.username.trim(), email, firstName: i.firstName.trim(), lastName: i.lastName.trim(),
    passwordHash: hash(i.password),
    security: i.security.map((s) => ({ qId: s.qId, answerHash: hash(normalizeAnswer(s.answer)) })),
  };
  c.s.accounts[k] = acct;
  return ok(u);
}

export function login(c: Ctx, username: string, password: string): Result<User> {
  const k = key(username);
  if (locked(c, k)) return err('auth_locked');
  const a = c.s.accounts[k];
  if (!a || a.passwordHash !== hash(password)) { fail(c, k); return err('invalid_credentials'); } // same error for both
  clear(c, k);
  return ok(c.s.users[a.userId]);
}

export function getSecurityQuestions(c: Ctx, username: string): Result<string[]> {
  const a = c.s.accounts[key(username)];
  if (!a) return err('account_not_found');
  return ok(a.security.map((s) => SECURITY_QUESTIONS.find((q) => q.id === s.qId)?.text ?? ''));
}

export function verifySecurityAnswers(c: Ctx, username: string, answers: string[]): Result<string> {
  const k = key(username);
  const a = c.s.accounts[k];
  if (!a) return err('account_not_found');
  const lk = `reset:${k}`;
  if (locked(c, lk)) return err('auth_locked');
  const good = answers.length === 3 && a.security.every((s, idx) => s.answerHash === hash(normalizeAnswer(answers[idx])));
  if (!good) { fail(c, lk); return err('wrong_answers'); }
  clear(c, lk);
  const token = uid(c.s, 'rt');
  c.s.resetTokens[k] = { token, expires: c.now + RESET_TTL_MS };
  return ok(token);
}

export function resetPassword(c: Ctx, username: string, token: string, password: string, confirm: string): Result<true> {
  const k = key(username);
  const t = c.s.resetTokens[k];
  const a = c.s.accounts[k];
  if (!a || !t || t.token !== token || t.expires < c.now) return err('invalid_reset');
  const bad = validatePassword(password) ?? validateConfirm(password, confirm);
  if (bad) return err(bad);
  a.passwordHash = hash(password);
  delete c.s.resetTokens[k];
  clear(c, k);
  return ok(true);
}
