// Accounts and sessions. The client sends SHA-256 hashes (salted with the username), never plaintext passwords or answers.
// MVP-grade: see docs/why-spacetime.md. Plaintext-dependent checks (strength, confirm, same_password) run on the client.
import {
  SECURITY_QUESTIONS, validateEmail, validateFirstName, validateLastName, validateUsername,
} from './shared/authLogic';
import { HASH_RE } from './shared/sha256';
import type { AccountInfo, ErrorCode, Result, User } from './shared/types';
import { userOf } from './shared/mappers';
import { bindSession, DEFAULT_AVATAR, type Env, err, ok, STARTING_BALANCE_CENTS, enqueue, uid, meOf } from './core';

const MAX_FAILS = 5;
const LOCK_MS = 30_000;
const RESET_TTL_MS = 10 * 60_000;

export interface HashedAnswer { qId: string; answerHash: string }
export interface RegisterArgs {
  firstName: string; lastName: string; email: string; username: string; passwordHash: string; security: HashedAnswer[];
}

const keyOf = (username: string) => username.trim().toLowerCase();

function locked(env: Env, k: string): boolean {
  const a = env.ctx.db.authAttempt.key.find(k);
  return !!a && a.untilMs > env.now;
}
function fail(env: Env, k: string): void {
  const db = env.ctx.db.authAttempt;
  const a = db.key.find(k) ?? { key: k, n: 0, untilMs: 0 };
  const n = a.untilMs && a.untilMs <= env.now ? 1 : a.n + 1;
  const row = { key: k, n, untilMs: n >= MAX_FAILS ? env.now + LOCK_MS : 0 };
  if (db.key.find(k)) db.key.update(row); else db.insert(row);
}
function clear(env: Env, k: string): void { env.ctx.db.authAttempt.key.delete(k); }

const parseSecurity = (json: string): HashedAnswer[] => { try { return JSON.parse(json) as HashedAnswer[]; } catch { return []; } };

export const accountInfoRow = (a: { username: string; email: string; firstName: string; lastName: string; securityJson: string }): AccountInfo => ({
  username: a.username, email: a.email, firstName: a.firstName, lastName: a.lastName, securityQuestionIds: parseSecurity(a.securityJson).map((s) => s.qId),
});

function validSecurityHashes(items: HashedAnswer[]): boolean {
  if (items.length !== 3) return false;
  const ids = new Set(items.map((i) => i.qId));
  return ids.size === 3 && [...ids].every((id) => SECURITY_QUESTIONS.some((q) => q.id === id)) && items.every((i) => HASH_RE.test(i.answerHash));
}

export function createUser(env: Env, name: string, avatar: string, extra?: { id?: string; isSeed?: boolean; squadId?: string; balance?: number }) {
  const c = env.ctx;
  const id = extra?.id ?? uid(env, 'u');
  const row = {
    id, name, avatar: avatar || DEFAULT_AVATAR, squadId: extra?.squadId ?? '', balanceCents: extra?.balance ?? STARTING_BALANCE_CENTS, isSeed: extra?.isSeed ?? false,
  };
  c.db.user.insert(row);
  enqueue(c, 'nessie_create_user', `user:${id}`, { userId: id, name });
  return row;
}

export function registerAccount(env: Env, i: RegisterArgs): Result<User> {
  const c = env.ctx;
  const bad = validateFirstName(i.firstName) ?? validateLastName(i.lastName) ?? validateEmail(i.email) ?? validateUsername(i.username);
  if (bad) return err(bad);
  if (!HASH_RE.test(i.passwordHash)) return err('weak_password');
  if (!validSecurityHashes(i.security)) return err('invalid_security');
  const k = keyOf(i.username);
  if (c.db.account.key.find(k)) return err('username_taken');
  const email = i.email.trim().toLowerCase();
  if ([...c.db.account.email.filter(email)].length > 0) return err('email_taken');
  const u = createUser(env, i.username.trim(), DEFAULT_AVATAR);
  c.db.account.insert({
    key: k, userId: u.id, username: i.username.trim(), email, firstName: i.firstName.trim(), lastName: i.lastName.trim(), passwordHash: i.passwordHash,
    securityJson: JSON.stringify(i.security.map((s) => ({ qId: s.qId, answerHash: s.answerHash }))),
  });
  bindSession(env, u.id);
  return ok(userOf(u));
}

export function registerUser(env: Env, input: { name: string; avatar: string }): Result<User> {
  const n = input.name.trim();
  if (n.length < 1 || n.length > 20) return err('invalid_name');
  const u = createUser(env, n, input.avatar);
  bindSession(env, u.id);
  return ok(userOf(u));
}

export function login(env: Env, username: string, passwordHash: string): Result<User> {
  const c = env.ctx;
  const k = keyOf(username);
  if (locked(env, k)) return err('auth_locked');
  const a = c.db.account.key.find(k);
  if (!a || a.passwordHash !== passwordHash) { fail(env, k); return err('invalid_credentials'); } // same error for both
  clear(env, k);
  const u = c.db.user.id.find(a.userId);
  if (!u) return err('invalid_credentials');
  bindSession(env, u.id);
  return ok(userOf(u));
}

export function claimSeedUser(env: Env, userId: string): Result<User> {
  const u = env.ctx.db.user.id.find(userId);
  if (!u || !u.isSeed) return err('no_user');
  bindSession(env, u.id);
  return ok(userOf(u));
}

export function logout(env: Env): void {
  env.ctx.db.session.identity.delete(env.ctx.sender);
}

export function getSecurityQuestionIds(env: Env, username: string): Result<string[]> {
  const a = env.ctx.db.account.key.find(keyOf(username));
  if (!a) return err('account_not_found');
  return ok(parseSecurity(a.securityJson).map((s) => s.qId));
}

export function verifySecurityAnswers(env: Env, username: string, answerHashes: string[]): Result<string> {
  const c = env.ctx;
  const k = keyOf(username);
  const a = c.db.account.key.find(k);
  if (!a) return err('account_not_found');
  const lk = `reset:${k}`;
  if (locked(env, lk)) return err('auth_locked');
  const sec = parseSecurity(a.securityJson);
  const good = answerHashes.length === 3 && sec.every((s, idx) => s.answerHash === answerHashes[idx]);
  if (!good) { fail(env, lk); return err('wrong_answers'); }
  clear(env, lk);
  const token = `${uid(env, 'rt')}${Math.floor(c.random() * 0xffffffff).toString(36)}`;
  const row = { key: k, token, expiresMs: env.now + RESET_TTL_MS };
  if (c.db.resetToken.key.find(k)) c.db.resetToken.key.update(row); else c.db.resetToken.insert(row);
  return ok(token);
}

export function resetPassword(env: Env, username: string, token: string, passwordHash: string): Result<true> {
  const c = env.ctx;
  const k = keyOf(username);
  const t = c.db.resetToken.key.find(k);
  const a = c.db.account.key.find(k);
  if (!a || !t || t.token !== token || t.expiresMs < env.now) return err('invalid_reset');
  if (!HASH_RE.test(passwordHash)) return err('weak_password');
  c.db.account.key.update({ ...a, passwordHash });
  c.db.resetToken.key.delete(k);
  clear(env, k);
  return ok(true);
}

/* ---------- signed-in account management ---------- */
function ownAccount(env: Env) {
  if (!env.userId) return null;
  return [...env.ctx.db.account.userId.filter(env.userId)][0] ?? null;
}

function confirmPassword(env: Env, a: { key: string; passwordHash: string }, passwordHash: string): ErrorCode | null {
  const lk = `confirm:${a.key}`;
  if (locked(env, lk)) return 'auth_locked';
  if (a.passwordHash !== passwordHash) { fail(env, lk); return 'wrong_password'; }
  clear(env, lk);
  return null;
}

export function updateAvatar(env: Env, avatar: string): Result<User> {
  const me = meOf(env);
  if (!me) return err('no_user');
  const v = typeof avatar === 'string' ? avatar.trim() : '';
  if (!v || v.length > 200) return err('invalid_avatar');
  const row = { ...me, avatar: v };
  env.ctx.db.user.id.update(row);
  return ok(userOf(row));
}

export function updateAccountName(env: Env, i: { firstName: string; lastName: string }): Result<AccountInfo> {
  const a = ownAccount(env);
  if (!a) return err(env.userId ? 'no_account' : 'no_user');
  const bad = validateFirstName(i.firstName) ?? validateLastName(i.lastName);
  if (bad) return err(bad);
  const row = { ...a, firstName: i.firstName.trim(), lastName: i.lastName.trim() };
  env.ctx.db.account.key.update(row);
  return ok(accountInfoRow(row));
}

export function changeEmail(env: Env, newEmail: string, passwordHash: string): Result<AccountInfo> {
  const a = ownAccount(env);
  if (!a) return err(env.userId ? 'no_account' : 'no_user');
  const bad = validateEmail(newEmail);
  if (bad) return err(bad);
  const email = newEmail.trim().toLowerCase();
  if (email === a.email) return err('same_email');
  const wrong = confirmPassword(env, a, passwordHash);
  if (wrong) return err(wrong);
  if ([...env.ctx.db.account.email.filter(email)].some((x) => x.key !== a.key)) return err('email_taken');
  const row = { ...a, email };
  env.ctx.db.account.key.update(row);
  return ok(accountInfoRow(row));
}

export function changePassword(env: Env, currentHash: string, nextHash: string): Result<true> {
  const a = ownAccount(env);
  if (!a) return err(env.userId ? 'no_account' : 'no_user');
  if (!HASH_RE.test(nextHash)) return err('weak_password');
  if (nextHash === currentHash) return err('same_password');
  const wrong = confirmPassword(env, a, currentHash);
  if (wrong) return err(wrong);
  env.ctx.db.account.key.update({ ...a, passwordHash: nextHash });
  env.ctx.db.resetToken.key.delete(a.key); // a half-finished "forgot password" can no longer overwrite the new one
  clear(env, a.key);
  return ok(true);
}

export function updateSecurity(env: Env, passwordHash: string, items: HashedAnswer[]): Result<AccountInfo> {
  const a = ownAccount(env);
  if (!a) return err(env.userId ? 'no_account' : 'no_user');
  if (!validSecurityHashes(items)) return err('invalid_security');
  const wrong = confirmPassword(env, a, passwordHash);
  if (wrong) return err(wrong);
  const row = { ...a, securityJson: JSON.stringify(items.map((s) => ({ qId: s.qId, answerHash: s.answerHash }))) };
  env.ctx.db.account.key.update(row);
  env.ctx.db.resetToken.key.delete(a.key);
  return ok(accountInfoRow(row));
}
