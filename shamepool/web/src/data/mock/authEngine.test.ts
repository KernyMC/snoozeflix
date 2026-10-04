import { beforeEach, describe, expect, it } from 'vitest';
import * as A from './authEngine';
import { makeSeed } from './seed';
import type { Ctx, MockState } from './state';

const NOW = new Date('2026-10-07T12:00:00-04:00').getTime();
let s: MockState;
let now = NOW;
const ctx = (): Ctx => ({ s, now, userId: null });
const input = {
  firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com', username: 'JaneD', password: 'hunter22', confirm: 'hunter22',
  security: [{ qId: 'pet', answer: 'Rex' }, { qId: 'city', answer: 'Ann Arbor' }, { qId: 'car', answer: 'Honda' }],
};

beforeEach(() => { s = makeSeed(NOW); now = NOW; });

describe('registerAccount', () => {
  it('creates a user and account', () => {
    const r = A.registerAccount(ctx(), input);
    expect(r.ok && r.data.name).toBe('JaneD');
    expect(s.accounts.janed.email).toBe('jane@example.com');
  });
  it('rejects duplicates and bad input', () => {
    A.registerAccount(ctx(), input);
    expect(A.registerAccount(ctx(), { ...input, username: 'janed', email: 'x@y.com' })).toMatchObject({ ok: false, error: 'username_taken' });
    expect(A.registerAccount(ctx(), { ...input, username: 'other', email: 'JANE@example.com' })).toMatchObject({ ok: false, error: 'email_taken' });
    expect(A.registerAccount(ctx(), { ...input, username: 'other2', confirm: 'nope' })).toMatchObject({ ok: false, error: 'password_mismatch' });
    expect(A.registerAccount(ctx(), { ...input, username: 'other3', password: 'weak', confirm: 'weak' })).toMatchObject({ ok: false, error: 'weak_password' });
  });
});

describe('login', () => {
  beforeEach(() => { A.registerAccount(ctx(), input); });
  it('succeeds case-insensitively on username', () => {
    expect(A.login(ctx(), 'janed', 'hunter22').ok).toBe(true);
  });
  it('gives the same error for bad password and unknown user', () => {
    expect(A.login(ctx(), 'janed', 'wrong')).toMatchObject({ ok: false, error: 'invalid_credentials' });
    expect(A.login(ctx(), 'ghost', 'hunter22')).toMatchObject({ ok: false, error: 'invalid_credentials' });
  });
  it('locks after 5 failures, then unlocks after 30s', () => {
    for (let i = 0; i < 5; i++) A.login(ctx(), 'janed', 'wrong');
    expect(A.login(ctx(), 'janed', 'hunter22')).toMatchObject({ ok: false, error: 'auth_locked' });
    now += 31_000;
    expect(A.login(ctx(), 'janed', 'hunter22').ok).toBe(true);
  });
});

describe('password reset', () => {
  beforeEach(() => { A.registerAccount(ctx(), input); });
  it('returns the chosen questions in order', () => {
    const r = A.getSecurityQuestions(ctx(), 'JANED');
    expect(r.ok && r.data[0]).toBe('What was the name of your first pet?');
    expect(A.getSecurityQuestions(ctx(), 'ghost')).toMatchObject({ ok: false, error: 'account_not_found' });
  });
  it('verifies answers ignoring case and spacing, then resets', () => {
    const v = A.verifySecurityAnswers(ctx(), 'janed', ['  rex', 'ann  ARBOR', 'honda']);
    expect(v.ok).toBe(true);
    const token = v.ok ? v.data : '';
    expect(A.resetPassword(ctx(), 'janed', 'bad-token', 'newpass99', 'newpass99')).toMatchObject({ ok: false, error: 'invalid_reset' });
    expect(A.resetPassword(ctx(), 'janed', token, 'newpass99', 'different')).toMatchObject({ ok: false, error: 'password_mismatch' });
    expect(A.resetPassword(ctx(), 'janed', token, 'newpass99', 'newpass99').ok).toBe(true);
    expect(A.login(ctx(), 'janed', 'hunter22').ok).toBe(false);
    expect(A.login(ctx(), 'janed', 'newpass99').ok).toBe(true);
    expect(A.resetPassword(ctx(), 'janed', token, 'again123', 'again123')).toMatchObject({ ok: false, error: 'invalid_reset' }); // single use
  });
  it('rejects wrong answers and locks after 5', () => {
    expect(A.verifySecurityAnswers(ctx(), 'janed', ['a', 'b', 'c'])).toMatchObject({ ok: false, error: 'wrong_answers' });
    for (let i = 0; i < 4; i++) A.verifySecurityAnswers(ctx(), 'janed', ['a', 'b', 'c']);
    expect(A.verifySecurityAnswers(ctx(), 'janed', ['rex', 'ann arbor', 'honda'])).toMatchObject({ ok: false, error: 'auth_locked' });
  });
  it('expires the reset token', () => {
    const v = A.verifySecurityAnswers(ctx(), 'janed', ['rex', 'ann arbor', 'honda']);
    now += 11 * 60_000;
    expect(A.resetPassword(ctx(), 'janed', v.ok ? v.data : '', 'newpass99', 'newpass99')).toMatchObject({ ok: false, error: 'invalid_reset' });
  });
});

describe('account management', () => {
  let uidOf = '';
  const me = (): Ctx => ({ s, now, userId: uidOf });
  const other = { ...input, username: 'bob', email: 'bob@example.com' };
  beforeEach(() => {
    const r = A.registerAccount(ctx(), input);
    uidOf = r.ok ? r.data.id : '';
    A.registerAccount(ctx(), other);
  });

  it('needs a signed-in user with an account', () => {
    expect(A.changeEmail(ctx(), 'new@example.com', 'hunter22')).toMatchObject({ ok: false, error: 'no_user' });
    s.users.loner = { id: 'loner', name: 'Loner', avatar: '🙂', squadId: null, balanceCents: 0 };
    expect(A.changePassword({ s, now, userId: 'loner' }, 'a', 'newpass99', 'newpass99')).toMatchObject({ ok: false, error: 'no_account' });
  });

  it('changes the email after checking format, password and uniqueness', () => {
    expect(A.changeEmail(me(), 'not-an-email', 'hunter22')).toMatchObject({ ok: false, error: 'invalid_email' });
    expect(A.changeEmail(me(), ' JANE@example.com ', 'hunter22')).toMatchObject({ ok: false, error: 'same_email' });
    expect(A.changeEmail(me(), 'new@example.com', 'wrong')).toMatchObject({ ok: false, error: 'wrong_password' });
    expect(A.changeEmail(me(), 'BOB@example.com', 'hunter22')).toMatchObject({ ok: false, error: 'email_taken' });
    expect(s.accounts.janed.email).toBe('jane@example.com');
    const r = A.changeEmail(me(), ' New@Example.com ', 'hunter22');
    expect(r.ok && r.data.email).toBe('new@example.com');
    expect(s.accounts.janed.email).toBe('new@example.com');
  });

  it('changes the password only with the current one, a strong new one and a matching confirm', () => {
    expect(A.changePassword(me(), 'hunter22', 'weak', 'weak')).toMatchObject({ ok: false, error: 'weak_password' });
    expect(A.changePassword(me(), 'hunter22', 'newpass99', 'newpass98')).toMatchObject({ ok: false, error: 'password_mismatch' });
    expect(A.changePassword(me(), 'hunter22', 'hunter22', 'hunter22')).toMatchObject({ ok: false, error: 'same_password' });
    expect(A.changePassword(me(), 'wrong', 'newpass99', 'newpass99')).toMatchObject({ ok: false, error: 'wrong_password' });
    expect(A.login(ctx(), 'janed', 'hunter22').ok).toBe(true);
    expect(A.changePassword(me(), 'hunter22', 'newpass99', 'newpass99').ok).toBe(true);
    expect(A.login(ctx(), 'janed', 'hunter22').ok).toBe(false);
    expect(A.login(ctx(), 'janed', 'newpass99').ok).toBe(true);
  });

  it('cancels a pending reset token when the password changes', () => {
    const v = A.verifySecurityAnswers(ctx(), 'janed', ['rex', 'ann arbor', 'honda']);
    expect(A.changePassword(me(), 'hunter22', 'newpass99', 'newpass99').ok).toBe(true);
    expect(A.resetPassword(ctx(), 'janed', v.ok ? v.data : '', 'again123', 'again123')).toMatchObject({ ok: false, error: 'invalid_reset' });
  });

  it('locks password confirmation after 5 wrong tries without locking sign-in', () => {
    for (let i = 0; i < 5; i++) A.changeEmail(me(), 'new@example.com', 'wrong');
    expect(A.changeEmail(me(), 'new@example.com', 'hunter22')).toMatchObject({ ok: false, error: 'auth_locked' });
    expect(A.login(ctx(), 'janed', 'hunter22').ok).toBe(true);
    now += 31_000;
    expect(A.changeEmail(me(), 'new@example.com', 'hunter22').ok).toBe(true);
  });

  it('updates the name and avatar', () => {
    expect(A.updateAccountName(me(), { firstName: '', lastName: 'Doe' })).toMatchObject({ ok: false, error: 'invalid_first_name' });
    expect(A.updateAccountName(me(), { firstName: 'Jane', lastName: 'D0e' })).toMatchObject({ ok: false, error: 'invalid_last_name' });
    const r = A.updateAccountName(me(), { firstName: ' Janet ', lastName: "O'Neil" });
    expect(r.ok && `${r.data.firstName} ${r.data.lastName}`).toBe("Janet O'Neil");
    expect(A.updateAvatar(me(), '  ')).toMatchObject({ ok: false, error: 'invalid_avatar' });
    expect(A.updateAvatar(me(), '/assets/avatar/06-raccoon.png').ok).toBe(true);
    expect(s.users[uidOf].avatar).toBe('/assets/avatar/06-raccoon.png');
  });

  it('replaces security questions only with the current password', () => {
    const next = [{ qId: 'team', answer: 'Lions' }, { qId: 'street', answer: 'Main St' }, { qId: 'nickname', answer: 'JJ' }];
    expect(A.updateSecurity(me(), 'hunter22', next.slice(0, 2))).toMatchObject({ ok: false, error: 'invalid_security' });
    expect(A.updateSecurity(me(), 'wrong', next)).toMatchObject({ ok: false, error: 'wrong_password' });
    const r = A.updateSecurity(me(), 'hunter22', next);
    expect(r.ok && r.data.securityQuestionIds).toEqual(['team', 'street', 'nickname']);
    expect(A.verifySecurityAnswers(ctx(), 'janed', ['rex', 'ann arbor', 'honda'])).toMatchObject({ ok: false, error: 'wrong_answers' });
    expect(A.verifySecurityAnswers(ctx(), 'janed', ['lions', 'main st', 'jj']).ok).toBe(true);
  });

  it('never exposes hashes in account info', () => {
    expect(Object.keys(A.accountInfo(s.accounts.janed)).sort()).toEqual(['email', 'firstName', 'lastName', 'securityQuestionIds', 'username']);
  });
});
