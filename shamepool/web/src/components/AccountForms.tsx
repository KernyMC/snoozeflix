'use client';
import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronDown, IdCard, KeyRound, Mail, ShieldQuestionMark } from 'lucide-react';
import {
  changeEmail, changePassword, normalizeAnswer, SECURITY_QUESTIONS, updateAccountName, updateAvatar, updateSecurity, useAccount, useMe,
  validateConfirm, validateEmail, validateFirstName, validateLastName, validatePassword, type AccountInfo, type ErrorCode,
} from '@/data';
import { focusFirstInvalid } from '@/components/auth/AuthShell';
import { PasswordField } from '@/components/auth/PasswordField';
import { Avatar, AVATARS } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field, inputCls } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { MoneyText } from '@/components/ui/Money';
import { errorText } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';

type Errs = Record<string, string>;
const NEED_PASSWORD = 'Enter your current password.';

/** Field errors appear on blur and on submit, never while typing (same behaviour as the register page). */
function useErrors(validate: () => Errs) {
  const [err, setErr] = useState<Errs>({});
  const [formErr, setFormErr] = useState('');
  const blur = (k: string) => () => {
    const all = validate();
    setErr((p) => {
      const n = { ...p };
      if (all[k]) n[k] = all[k]; else delete n[k];
      return n;
    });
  };
  /** Put a rejected action's error on the field it belongs to, or on the form when it has no field. */
  const reject = (code: ErrorCode, fields: Partial<Record<ErrorCode, string>>, form: HTMLFormElement | null) => {
    const k = fields[code];
    if (k) { setErr({ [k]: errorText(code) }); focusFirstInvalid(form); } else setFormErr(errorText(code));
  };
  return { err, setErr, formErr, setFormErr, blur, reject };
}

const FormError = ({ text }: { text: string }) => (text ? <p className="text-sm text-ember-dark font-extrabold text-center" role="alert">{text}</p> : null);

/* ---------- profile card + avatar ---------- */
export function ProfileCard() {
  const me = useMe();
  const account = useAccount();
  const { toast } = useToast();
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  if (!me) return null;
  const fullName = account ? `${account.firstName} ${account.lastName}`.trim() : '';

  const pick = async (avatar: string) => {
    if (saving || avatar === me.avatar) return;
    setSaving(avatar);
    const r = await updateAvatar(avatar);
    setSaving(null);
    if (r.ok) setPicking(false);
    toast(r.ok ? 'New look saved' : errorText(r.error), r.ok ? 'success' : 'error');
  };

  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="size-16 rounded-full bg-sky-light grid place-items-center text-4xl shrink-0"><Avatar value={me.avatar} size={64} /></div>
        <div className="min-w-0">
          <p className="font-display font-black text-2xl truncate">{fullName || me.name}</p>
          {account && <p className="font-bold text-ink-soft truncate">@{account.username}</p>}
          {account && <p className="font-bold text-ink-soft truncate">{account.email}</p>}
          <p className="font-bold text-ink-soft">Balance <MoneyText cents={me.balanceCents} /></p>
        </div>
      </div>
      <Button variant="secondary" type="button" aria-expanded={picking} onClick={() => setPicking((p) => !p)}>
        {picking ? 'Keep this avatar' : 'Change avatar'}
      </Button>
      {picking && (
        <div className="grid grid-cols-5 gap-2" role="radiogroup" aria-label="Avatar">
          {AVATARS.map((a) => (
            <button key={a} type="button" role="radio" aria-checked={me.avatar === a} aria-label={`Avatar ${AVATARS.indexOf(a) + 1}`}
              disabled={!!saving} onClick={() => pick(a)}
              className={`aspect-square rounded-xl border-2 p-1 grid place-items-center shadow-chunky-sm active:translate-y-[2px] active:shadow-none ${
                me.avatar === a ? 'border-sky bg-sky-light [--edge:var(--color-sky-dark)]' : 'border-surface-line bg-white'
              } ${saving === a ? 'animate-pulse' : ''} ${saving && saving !== a ? 'opacity-50' : ''}`}>
              <Avatar value={a} size={48} />
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ---------- forms ---------- */
function NameForm({ account, onDone }: { account: AccountInfo; onDone: () => void }) {
  const { toast } = useToast();
  const [first, setFirst] = useState(account.firstName);
  const [last, setLast] = useState(account.lastName);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLFormElement>(null);
  const validate = (): Errs => {
    const e: Errs = {};
    const a = validateFirstName(first); if (a) e.firstName = errorText(a);
    const b = validateLastName(last); if (b) e.lastName = errorText(b);
    return e;
  };
  const { err, setErr, formErr, setFormErr, blur, reject } = useErrors(validate);
  const unchanged = first.trim() === account.firstName && last.trim() === account.lastName;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || unchanged) return;
    setFormErr('');
    const v = validate();
    setErr(v);
    if (Object.keys(v).length) return focusFirstInvalid(ref.current);
    setBusy(true);
    const r = await updateAccountName({ firstName: first, lastName: last });
    setBusy(false);
    if (!r.ok) return reject(r.error, { invalid_first_name: 'firstName', invalid_last_name: 'lastName' }, ref.current);
    toast('Name updated', 'success');
    onDone();
  };

  return (
    <form ref={ref} onSubmit={submit} noValidate className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="First name" value={first} onChange={(e) => setFirst(e.target.value)} onBlur={blur('firstName')} error={err.firstName}
          maxLength={30} autoComplete="given-name" enterKeyHint="next" />
        <Field label="Last name" value={last} onChange={(e) => setLast(e.target.value)} onBlur={blur('lastName')} error={err.lastName}
          maxLength={30} autoComplete="family-name" enterKeyHint="done" />
      </div>
      <p className="text-xs text-ink-faint font-bold">Your squad sees your username, @{account.username}. That one stays put.</p>
      <FormError text={formErr} />
      <Button type="submit" loading={busy} disabled={unchanged}>Save name</Button>
    </form>
  );
}

function EmailForm({ account, onDone }: { account: AccountInfo; onDone: () => void }) {
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLFormElement>(null);
  const validate = (): Errs => {
    const e: Errs = {};
    const bad = validateEmail(email);
    if (bad) e.email = errorText(bad);
    else if (email.trim().toLowerCase() === account.email) e.email = errorText('same_email');
    if (!pw) e.password = NEED_PASSWORD;
    return e;
  };
  const { err, setErr, formErr, setFormErr, blur, reject } = useErrors(validate);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setFormErr('');
    const v = validate();
    setErr(v);
    if (Object.keys(v).length) return focusFirstInvalid(ref.current);
    setBusy(true);
    const r = await changeEmail(email, pw);
    setBusy(false);
    if (!r.ok) return reject(r.error, { invalid_email: 'email', same_email: 'email', email_taken: 'email', wrong_password: 'password' }, ref.current);
    toast('Email updated', 'success');
    onDone();
  };

  return (
    <form ref={ref} onSubmit={submit} noValidate className="space-y-4">
      <p className="font-bold text-ink-soft break-all">Current: <b className="text-ink">{account.email}</b></p>
      <Field label="New email address" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} onBlur={blur('email')}
        error={err.email} maxLength={254} placeholder="jane@example.com" autoComplete="email" autoCapitalize="none" spellCheck={false} enterKeyHint="next" />
      <PasswordField label="Current password" value={pw} onChange={(e) => setPw(e.target.value)} onBlur={blur('password')} error={err.password}
        maxLength={72} placeholder="Confirm it is you" autoComplete="current-password" enterKeyHint="go" />
      <FormError text={formErr} />
      <Button type="submit" loading={busy}>Update email</Button>
    </form>
  );
}

function PasswordForm({ account, onDone }: { account: AccountInfo; onDone: () => void }) {
  const { toast } = useToast();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLFormElement>(null);
  const validate = (): Errs => {
    const e: Errs = {};
    if (!cur) e.current = NEED_PASSWORD;
    const bad = validatePassword(next);
    if (bad) e.next = errorText(bad);
    else if (next === cur) e.next = errorText('same_password');
    if (!confirm) e.confirm = 'Re-enter your new password.';
    else if (!bad && validateConfirm(next, confirm)) e.confirm = errorText('password_mismatch');
    return e;
  };
  const { err, setErr, formErr, setFormErr, blur, reject } = useErrors(validate);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setFormErr('');
    const v = validate();
    setErr(v);
    if (Object.keys(v).length) return focusFirstInvalid(ref.current);
    setBusy(true);
    const r = await changePassword(cur, next, confirm);
    setBusy(false);
    if (!r.ok) {
      return reject(r.error, { wrong_password: 'current', weak_password: 'next', same_password: 'next', password_mismatch: 'confirm' }, ref.current);
    }
    toast('Password updated', 'success');
    onDone();
  };

  return (
    <form ref={ref} onSubmit={submit} noValidate className="space-y-4">
      {/* Lets password managers file the new password under the right login. */}
      <input type="text" name="username" autoComplete="username" value={account.username} readOnly hidden />
      <PasswordField label="Current password" value={cur} onChange={(e) => setCur(e.target.value)} onBlur={blur('current')} error={err.current}
        maxLength={72} placeholder="Enter your current password" autoComplete="current-password" enterKeyHint="next" />
      <PasswordField showStrength label="New password" value={next} onChange={(e) => setNext(e.target.value)} onBlur={blur('next')} error={err.next}
        maxLength={72} placeholder="At least 8 characters" hint="Use a letter and a number." autoComplete="new-password" enterKeyHint="next" />
      <PasswordField label="Confirm new password" value={confirm} onChange={(e) => setConfirm(e.target.value)} onBlur={blur('confirm')} error={err.confirm}
        maxLength={72} placeholder="Re-enter your new password" autoComplete="new-password" enterKeyHint="go" />
      <FormError text={formErr} />
      <Button type="submit" loading={busy}>Update password</Button>
    </form>
  );
}

function SecurityForm({ account, onDone }: { account: AccountInfo; onDone: () => void }) {
  const { toast } = useToast();
  const [qs, setQs] = useState(() => [0, 1, 2].map((i) => account.securityQuestionIds[i] ?? ''));
  const [ans, setAns] = useState(['', '', '']);
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLFormElement>(null);
  const validate = (): Errs => {
    const e: Errs = {};
    qs.forEach((q, i) => {
      if (!q) e[`q${i}`] = 'Choose a question.';
      const n = normalizeAnswer(ans[i]).length;
      if (n < 2 || n > 50) e[`a${i}`] = 'Answer must be 2–50 characters.';
    });
    if (!pw) e.password = NEED_PASSWORD;
    return e;
  };
  const { err, setErr, formErr, setFormErr, blur, reject } = useErrors(validate);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setFormErr('');
    const v = validate();
    setErr(v);
    if (Object.keys(v).length) return focusFirstInvalid(ref.current);
    setBusy(true);
    const r = await updateSecurity(pw, qs.map((qId, i) => ({ qId, answer: ans[i] })));
    setBusy(false);
    if (!r.ok) return reject(r.error, { wrong_password: 'password' }, ref.current);
    toast('Security questions updated', 'success');
    onDone();
  };

  return (
    <form ref={ref} onSubmit={submit} noValidate className="space-y-4">
      <p className="text-sm font-bold text-ink-soft">These get you back in if you forget your password. Old answers are never shown, so enter all three again.</p>
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-3 rounded-xl border-2 border-surface-line p-3">
          <p className="text-xs font-black uppercase tracking-wide text-primary">Question {i + 1}</p>
          <div>
            <label htmlFor={`sq${i}`} className="block text-xs font-extrabold uppercase tracking-wide text-ink-soft mb-1.5">Select a question</label>
            <Select id={`sq${i}`} value={qs[i]} invalid={!!err[`q${i}`]} placeholder="Choose a question…"
              options={SECURITY_QUESTIONS.filter((q) => q.id === qs[i] || !qs.includes(q.id)).map((q) => ({ value: q.id, label: q.text }))}
              onChange={(v) => setQs((p) => p.map((old, j) => (j === i ? v : old)))} onBlur={blur(`q${i}`)}
              className={`${inputCls} ${err[`q${i}`] ? 'border-ember bg-ember-light' : ''}`} />
            {err[`q${i}`] && <p className="text-sm text-ember-dark font-extrabold mt-1" role="alert">{err[`q${i}`]}</p>}
          </div>
          <Field label="Your answer" value={ans[i]} maxLength={50} placeholder="Enter your answer" error={err[`a${i}`]}
            onChange={(e) => setAns((p) => p.map((v, j) => (j === i ? e.target.value : v)))} onBlur={blur(`a${i}`)}
            autoComplete="off" autoCapitalize="none" spellCheck={false} enterKeyHint="next" />
        </div>
      ))}
      <PasswordField label="Current password" value={pw} onChange={(e) => setPw(e.target.value)} onBlur={blur('password')} error={err.password}
        maxLength={72} placeholder="Confirm it is you" autoComplete="current-password" enterKeyHint="go" />
      <FormError text={formErr} />
      <Button type="submit" loading={busy}>Save questions</Button>
    </form>
  );
}

/* ---------- accordion ---------- */
type Key = 'name' | 'email' | 'password' | 'security';

function Row({ id, icon, title, summary, open, onToggle, children }: {
  id: Key; icon: ReactNode; title: string; summary: string; open: boolean; onToggle: () => void; children: ReactNode;
}) {
  return (
    <Card className="!p-0">
      <h3>
        <button type="button" id={`acct-${id}-btn`} aria-expanded={open} aria-controls={`acct-${id}-panel`} onClick={onToggle}
          className={`w-full flex items-center gap-3 p-4 min-h-[64px] text-left active:bg-surface-muted ${open ? 'rounded-t-[18px]' : 'rounded-[18px]'}`}>
          <span className="size-10 rounded-xl bg-sky-light text-sky-dark grid place-items-center shrink-0" aria-hidden>{icon}</span>
          <span className="min-w-0 flex-1">
            <span className="block font-display font-black text-lg leading-tight">{title}</span>
            <span className="block text-sm font-bold text-ink-soft truncate">{summary}</span>
          </span>
          <ChevronDown size={22} strokeWidth={3} aria-hidden className={`shrink-0 text-ink-faint transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </h3>
      {open && (
        <div id={`acct-${id}-panel`} role="region" aria-labelledby={`acct-${id}-btn`} className="border-t-2 border-surface-line p-4">{children}</div>
      )}
    </Card>
  );
}

/** Name, email, password and recovery questions, one section open at a time. */
export function AccountSettings() {
  const account = useAccount();
  const [open, setOpen] = useState<Key | null>(null);
  if (!account) {
    return <Card><p className="font-bold text-ink-soft">This profile was made without a login, so there is no email or password to manage.</p></Card>;
  }
  const toggle = (k: Key) => () => setOpen((o) => (o === k ? null : k));
  /** Close the section after a save and hand focus back to its header so keyboard users keep their place. */
  const done = (k: Key) => () => {
    setOpen(null);
    setTimeout(() => document.getElementById(`acct-${k}-btn`)?.focus(), 0);
  };
  const icon = { size: 22, strokeWidth: 2.5 };
  return (
    <div className="space-y-3">
      <Row id="name" icon={<IdCard {...icon} />} title="Name" summary={`${account.firstName} ${account.lastName}`.trim()} open={open === 'name'} onToggle={toggle('name')}>
        <NameForm account={account} onDone={done('name')} />
      </Row>
      <Row id="email" icon={<Mail {...icon} />} title="Email" summary={account.email} open={open === 'email'} onToggle={toggle('email')}>
        <EmailForm account={account} onDone={done('email')} />
      </Row>
      <Row id="password" icon={<KeyRound {...icon} />} title="Password" summary="Change your password" open={open === 'password'} onToggle={toggle('password')}>
        <PasswordForm account={account} onDone={done('password')} />
      </Row>
      <Row id="security" icon={<ShieldQuestionMark {...icon} />} title="Security questions" summary={`${account.securityQuestionIds.length} set, used to reset your password`}
        open={open === 'security'} onToggle={toggle('security')}>
        <SecurityForm account={account} onDone={done('security')} />
      </Row>
    </div>
  );
}
