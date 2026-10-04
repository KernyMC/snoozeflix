import {
  cardDigits, detectBrand, isExpired, MAX_ADDRESSES, MAX_PAYMENT_METHODS, parseExpiry, trialEnd, validateAddressInput, validatePaymentInput,
} from '../billingLogic';
import { enforceGoalLimit } from './engine';
import type { Address, AddressInput, Billing, PaymentMethod, PaymentMethodInput, PlanStart, PlanTier, Result } from '../types';
import { type Ctx, err, type MockState, ok, uid } from './state';

export const EMPTY_BILLING: Billing = { tier: 'free', payments: [], addresses: [] };

/** Read-only view; a user who has never touched billing is on the free tier with nothing saved. */
export const billingFor = (s: MockState, userId: string | null): Billing => (userId && s.billing?.[userId]) || EMPTY_BILLING;

/** The signed-in user's billing record, created on first write. */
function own(c: Ctx): Billing | null {
  if (!c.userId || !c.s.users[c.userId]) return null;
  const all = (c.s.billing ??= {});
  return (all[c.userId] ??= { tier: 'free', payments: [], addresses: [] });
}

export function addAddress(c: Ctx, i: AddressInput): Result<Address> {
  const b = own(c);
  if (!b) return err('no_user');
  const bad = validateAddressInput(i);
  if (bad) return err(bad);
  if (b.addresses.length >= MAX_ADDRESSES) return err('too_many_addresses');
  const a: Address = {
    id: uid(c.s, 'ad'), label: i.label.trim() || 'Address', fullName: i.fullName.trim(), line1: i.line1.trim(), line2: i.line2.trim(),
    city: i.city.trim(), state: i.state.trim().toUpperCase(), zip: i.zip.trim(), createdAt: c.now,
  };
  b.addresses.push(a);
  return ok(a);
}

/** Cards billed to the removed address keep working; they just lose the link. */
export function removeAddress(c: Ctx, id: string): Result<true> {
  const b = own(c);
  if (!b) return err('no_user');
  if (!b.addresses.some((a) => a.id === id)) return err('address_not_found');
  b.addresses = b.addresses.filter((a) => a.id !== id);
  for (const p of b.payments) if (p.addressId === id) p.addressId = null;
  return ok(true);
}

/**
 * Mock only: the full number and security code are checked here and then dropped; nothing but the brand,
 * last four digits and expiry is kept. The real backend must never receive them at all. The card form
 * should post straight to the payment processor and the server should store the token it returns.
 */
export function addPaymentMethod(c: Ctx, i: PaymentMethodInput): Result<PaymentMethod> {
  const b = own(c);
  if (!b) return err('no_user');
  const bad = validatePaymentInput(i, c.now);
  if (bad) return err(bad);
  if (i.addressId !== null && !b.addresses.some((a) => a.id === i.addressId)) return err('address_not_found');
  if (b.payments.length >= MAX_PAYMENT_METHODS) return err('too_many_payments');
  const brand = detectBrand(i.cardNumber)!;
  const last4 = cardDigits(i.cardNumber).slice(-4);
  const exp = parseExpiry(i.expiry)!;
  if (b.payments.some((p) => p.brand === brand && p.last4 === last4 && p.expMonth === exp.month && p.expYear === exp.year)) return err('duplicate_card');
  const p: PaymentMethod = {
    id: uid(c.s, 'pm'), nickname: i.nickname.trim(), nameOnCard: i.nameOnCard.trim(), brand, last4,
    expMonth: exp.month, expYear: exp.year, addressId: i.addressId, createdAt: c.now,
  };
  b.payments.push(p);
  return ok(p);
}

const usable = (b: Billing, now: number) => b.payments.filter((p) => !isExpired(p, now));

/** The paid tier needs a card to bill, so the last working card cannot go while it is active. */
export function removePaymentMethod(c: Ctx, id: string): Result<true> {
  const b = own(c);
  if (!b) return err('no_user');
  const p = b.payments.find((x) => x.id === id);
  if (!p) return err('payment_not_found');
  if (b.tier === 'paid' && !usable(b, c.now).some((x) => x.id !== id)) return err('payment_in_use');
  b.payments = b.payments.filter((x) => x.id !== id);
  return ok(true);
}

/** Going paid starts either with a charge today (`monthly`) or with a free trial whose first charge comes when it ends. */
export function setPlanTier(c: Ctx, tier: PlanTier, start: PlanStart = 'monthly'): Result<PlanTier> {
  const b = own(c);
  if (!b) return err('no_user');
  if ((tier !== 'free' && tier !== 'paid') || (start !== 'monthly' && start !== 'trial')) return err('invalid_tier');
  if (b.tier === tier) return err('same_tier');
  if (tier === 'paid' && usable(b, c.now).length === 0) return err('payment_required');
  b.tier = tier;
  b.trialEndsAt = tier === 'paid' && start === 'trial' ? trialEnd(c.now) : null;
  if (tier === 'free' && c.userId) enforceGoalLimit(c, c.userId); // downgrade: keep the oldest goal, pause the rest
  return ok(tier);
}
