// Plan tier, saved cards (brand + last four + expiry only) and addresses. The card form validates and drops the full
// number and CVC on the client; the module never receives them.
import {
  isExpired, MAX_ADDRESSES, MAX_PAYMENT_METHODS, trialEnd, validateAddressInput, validateCardName, validateNickname,
} from './shared/billingLogic';
import type { Address, AddressInput, PaymentMethod, PlanStart, PlanTier, Result } from './shared/types';
import { addressOf, paymentOf } from './shared/mappers';
import { type Env, err, ok, uid } from './core';

export interface CardArgs { nickname: string; nameOnCard: string; brand: string; last4: string; expMonth: number; expYear: number; addressId: string }

function plan(env: Env) {
  const id = env.userId!;
  return env.ctx.db.billingPlan.userId.find(id) ?? { userId: id, tier: 'free', trialEndsAt: -1 };
}
function savePlan(env: Env, row: { userId: string; tier: string; trialEndsAt: number }): void {
  const db = env.ctx.db.billingPlan;
  if (db.userId.find(row.userId)) db.userId.update(row); else db.insert(row);
}
const myCards = (env: Env) => [...env.ctx.db.paymentMethod.userId.filter(env.userId!)];
const myAddresses = (env: Env) => [...env.ctx.db.address.userId.filter(env.userId!)];
const usable = (cards: { expMonth: number; expYear: number }[], now: number) => cards.filter((p) => !isExpired(p, now));

export function addAddress(env: Env, i: AddressInput): Result<Address> {
  if (!env.userId) return err('no_user');
  const bad = validateAddressInput(i);
  if (bad) return err(bad);
  if (myAddresses(env).length >= MAX_ADDRESSES) return err('too_many_addresses');
  const row = {
    id: uid(env, 'ad'), userId: env.userId, label: i.label.trim() || 'Address', fullName: i.fullName.trim(), line1: i.line1.trim(), line2: i.line2.trim(),
    city: i.city.trim(), state: i.state.trim().toUpperCase(), zip: i.zip.trim(), createdAt: env.now,
  };
  env.ctx.db.address.insert(row);
  return ok(addressOf(row));
}

/** Cards billed to the removed address keep working; they just lose the link. */
export function removeAddress(env: Env, id: string): Result<true> {
  if (!env.userId) return err('no_user');
  const a = env.ctx.db.address.id.find(id);
  if (!a || a.userId !== env.userId) return err('address_not_found');
  env.ctx.db.address.id.delete(id);
  for (const p of myCards(env)) if (p.addressId === id) env.ctx.db.paymentMethod.id.update({ ...p, addressId: '' });
  return ok(true);
}

export function addPaymentMethod(env: Env, i: CardArgs): Result<PaymentMethod> {
  if (!env.userId) return err('no_user');
  const bad = validateCardName(i.nameOnCard) ?? validateNickname(i.nickname);
  if (bad) return err(bad);
  if (!['visa', 'mastercard', 'amex', 'discover'].includes(i.brand)) return err('unsupported_card');
  if (!/^\d{4}$/.test(i.last4)) return err('invalid_card_number');
  if (!Number.isInteger(i.expMonth) || i.expMonth < 1 || i.expMonth > 12 || i.expYear > new Date(env.now).getUTCFullYear() + 20) return err('invalid_expiry');
  if (isExpired({ expMonth: i.expMonth, expYear: i.expYear }, env.now)) return err('card_expired');
  const addresses = myAddresses(env);
  if (i.addressId !== '' && !addresses.some((a) => a.id === i.addressId)) return err('address_not_found');
  const cards = myCards(env);
  if (cards.length >= MAX_PAYMENT_METHODS) return err('too_many_payments');
  if (cards.some((p) => p.brand === i.brand && p.last4 === i.last4 && p.expMonth === i.expMonth && p.expYear === i.expYear)) return err('duplicate_card');
  const row = {
    id: uid(env, 'pm'), userId: env.userId, nickname: i.nickname.trim(), nameOnCard: i.nameOnCard.trim(), brand: i.brand, last4: i.last4,
    expMonth: i.expMonth, expYear: i.expYear, addressId: i.addressId, createdAt: env.now,
  };
  env.ctx.db.paymentMethod.insert(row);
  return ok(paymentOf(row));
}

/** The paid tier needs a card to bill, so the last working card cannot go while it is active. */
export function removePaymentMethod(env: Env, id: string): Result<true> {
  if (!env.userId) return err('no_user');
  const cards = myCards(env);
  if (!cards.some((p) => p.id === id)) return err('payment_not_found');
  if (plan(env).tier === 'paid' && usable(cards.filter((x) => x.id !== id), env.now).length === 0) return err('payment_in_use');
  env.ctx.db.paymentMethod.id.delete(id);
  return ok(true);
}

export function setPlanTier(env: Env, tier: PlanTier, start: PlanStart): Result<PlanTier> {
  if (!env.userId) return err('no_user');
  if ((tier !== 'free' && tier !== 'paid') || (start !== 'monthly' && start !== 'trial')) return err('invalid_tier');
  const p = plan(env);
  if (p.tier === tier) return err('same_tier');
  if (tier === 'paid' && usable(myCards(env), env.now).length === 0) return err('payment_required');
  savePlan(env, { userId: env.userId, tier, trialEndsAt: tier === 'paid' && start === 'trial' ? trialEnd(env.now) : -1 });
  return ok(tier);
}
