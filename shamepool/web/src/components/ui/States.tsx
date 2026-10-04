'use client';
import { Flakey, type Mood } from './Flakey';
import { Button } from './Button';

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden />;
}

export function ListSkeleton({ rows = 3, h = 'h-24' }: { rows?: number; h?: string }) {
  return (
    <div className="space-y-3" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className={`${h} w-full`} />)}
    </div>
  );
}

export function EmptyState({ title, line, mood = 'sleepy', cta, href, onClick }: {
  title: string; line?: string; mood?: Mood; cta?: string; href?: string; onClick?: () => void;
}) {
  return (
    <div className="flex flex-col items-center text-center gap-2 py-8 px-4">
      <Flakey mood={mood} size={120} />
      <h2 className="font-display font-black text-2xl mt-2">{title}</h2>
      {line && <p className="text-ink-soft font-bold max-w-xs">{line}</p>}
      {cta && <div className="w-full max-w-xs mt-4"><Button href={href} onClick={onClick}>{cta}</Button></div>}
    </div>
  );
}

export function ErrorState({ title = 'Something melted', line = 'That did not work. Try again?', onRetry }: { title?: string; line?: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center text-center gap-2 py-8 px-4" role="alert">
      <Flakey mood="melting" size={110} />
      <h2 className="font-display font-black text-2xl mt-2">{title}</h2>
      <p className="text-ink-soft font-bold max-w-xs">{line}</p>
      {onRetry && <div className="w-full max-w-xs mt-4"><Button variant="secondary" onClick={onRetry}>Retry</Button></div>}
    </div>
  );
}

export const ERROR_COPY: Record<string, string> = {
  invalid_name: 'Pick a name (1–20 characters).',
  invalid_code: 'That invite code does not exist.',
  already_in_squad: 'You are already in a squad.',
  squad_full: 'That squad is full (8 max).',
  invalid_amount: 'Pick an amount between $0.01 and $1,000.',
  invalid_title: 'Give it a title (max 40 characters).',
  no_days: 'Pick at least one day.',
  invalid_radius: 'Radius must be 50–1000 m.',
  invalid_penalty: 'Penalty must be at least $1 and no more than the cap.',
  invalid_location: 'We need a valid location.',
  invalid_stay: 'Stay time must be 1–180 minutes.',
  too_many_goals: 'Max 5 active goals. Finish one first.',
  not_due_today: 'This goal is not due today.',
  deadline_passed: 'The deadline already passed.',
  already_done: 'Already done today. Nice.',
  already_flaked: 'Already flaked today. Tomorrow is a new day.',
  left_area: 'You left the area. Check-in failed.',
  too_early: 'Too early. Keep staying there.',
  too_many_attempts: 'Too many tries. Check-in failed.',
  invalid_photo: 'That does not look like a photo.',
  invalid_message: 'Messages must be 1–280 characters.',
  rate_limited: 'Slow down. Five messages per ten seconds.',
  action_expired: 'That action expired. Ask again.',
  action_not_found: 'That action is gone.',
  pool_not_ready: 'The pool is not full yet.',
  proposal_open: 'There is already an open proposal.',
  pool_changed: 'The pool changed. Try again.',
  not_your_goal: 'That goal belongs to someone else.',
  invalid_first_name: 'Enter your first name.',
  invalid_last_name: 'Enter your last name.',
  invalid_email: 'Enter a valid email address.',
  invalid_username: 'Username: 3–20 letters, numbers or underscores.',
  weak_password: 'Password needs 8+ characters with a letter and a number.',
  password_mismatch: 'Passwords do not match.',
  username_taken: 'That username is taken.',
  email_taken: 'That email already has an account.',
  invalid_security: 'Pick 3 different questions and answer each (2–50 characters).',
  invalid_credentials: 'Wrong username or password.',
  account_not_found: 'We could not find that account.',
  wrong_answers: 'Those answers do not match.',
  auth_locked: 'Too many tries. Wait 30 seconds and try again.',
  invalid_reset: 'Reset session expired. Start over.',
  no_account: 'This profile has no login yet.',
  wrong_password: 'That is not your current password.',
  same_email: 'That is already your email.',
  same_password: 'Pick a password you are not already using.',
  invalid_avatar: 'Pick an avatar.',
  goal_locked: 'The pool goal is locked while the cash-out clock runs. Spend or donate the pool first.',
  ai_unavailable: 'Benny the Penny\u2019s eyes are tired. Try the photo again in a moment.',
  below_minimum: 'Minimum withdrawal is $5.',
  insufficient_available: 'That is more than you can withdraw right now.',
  withdrawal_pending: 'You already have a withdrawal in progress.',
  withdrawal_not_found: 'That withdrawal is gone or already landed.',
  invalid_card_name: 'Enter the name shown on the card.',
  invalid_card_number: 'That card number does not look right.',
  unsupported_card: 'We take Visa, Mastercard, American Express and Discover.',
  invalid_expiry: 'Enter the expiry as MM/YY.',
  card_expired: 'That card has expired.',
  invalid_cvc: 'Enter the security code on the card.',
  invalid_nickname: 'Nickname can be up to 30 characters.',
  duplicate_card: 'That card is already saved.',
  too_many_payments: 'You can save up to 5 cards. Remove one first.',
  payment_not_found: 'That card is already gone.',
  payment_in_use: 'The paid tier needs a working card. Add another card or switch to free first.',
  payment_required: 'Add a card that has not expired to go paid.',
  invalid_tier: 'Pick the free or the paid tier.',
  same_tier: 'You are already on that tier.',
  invalid_label: 'Label can be up to 20 characters.',
  invalid_address_name: 'Enter the full name for this address.',
  invalid_street: 'Enter a street address.',
  invalid_unit: 'Apartment or suite can be up to 30 characters.',
  invalid_city: 'Enter a city.',
  invalid_state: 'Use the two-letter state code, like MI.',
  invalid_zip: 'Enter a 5-digit ZIP code.',
  too_many_addresses: 'You can save up to 5 addresses. Remove one first.',
  address_not_found: 'That address is already gone.',
  mock_error: 'Simulated error (mockError=1).',
  not_available: 'Not available on the shared live server yet.',
  not_owner: 'Only the person who created the squad can remove members.',
  upgrade_required: 'The free tier has 1 goal. Upgrade to add more.',
  cannot_kick_self: 'You cannot remove yourself.',
  member_not_found: 'That person is not in your squad anymore.',
  kicked_from_squad: 'You were removed from this squad, so this invite no longer works for you.',
  offline: 'You are offline.',
};
export const errorText = (code: string) => ERROR_COPY[code] ?? 'Something went wrong. Try again.';
