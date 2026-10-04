import { beforeEach, describe, expect, it } from 'vitest';
import * as B from './billingEngine';
import { makeSeed } from './seed';
import type { Ctx, MockState } from './state';

const NOW = new Date('2026-10-07T12:00:00-04:00').getTime();
let s: MockState;
let now = NOW;
const ctx = (userId: string | null = 'seed_ana'): Ctx => ({ s, now, userId });
const card = { nickname: 'Everyday', nameOnCard: 'Ana Demo', cardNumber: '4242 4242 4242 4242', expiry: '09/29', cvc: '123', addressId: null as string | null };
const address = { label: 'Home', fullName: 'Ana Demo', line1: '1 Main Street', line2: '', city: 'Ann Arbor', state: 'mi', zip: '48104' };

beforeEach(() => { s = makeSeed(NOW); now = NOW; });

describe('billingFor', () => {
  it('defaults to the free tier with nothing saved', () => {
    expect(B.billingFor(s, 'seed_ana')).toEqual({ tier: 'free', payments: [], addresses: [] });
    expect(B.billingFor(s, null)).toEqual({ tier: 'free', payments: [], addresses: [] });
  });
  it('copes with a state saved before billing existed', () => {
    delete s.billing;
    expect(B.billingFor(s, 'seed_kevin').payments).toEqual([]);
    expect(B.addAddress(ctx(), address).ok).toBe(true);
    expect(B.billingFor(s, 'seed_ana').addresses).toHaveLength(1);
  });
  it('seeds Kevin with one card billed to one address', () => {
    const b = B.billingFor(s, 'seed_kevin');
    expect(b.payments).toHaveLength(1);
    expect(b.addresses).toHaveLength(1);
    expect(b.payments[0].addressId).toBe(b.addresses[0].id);
  });
});

describe('addresses', () => {
  it('saves a trimmed address with an upper-case state', () => {
    const r = B.addAddress(ctx(), { ...address, fullName: '  Ana Demo ' });
    expect(r).toMatchObject({ ok: true, data: { label: 'Home', fullName: 'Ana Demo', state: 'MI', zip: '48104' } });
    expect(B.billingFor(s, 'seed_ana').addresses).toHaveLength(1);
  });
  it('falls back to a generic label', () => {
    const r = B.addAddress(ctx(), { ...address, label: '  ' });
    expect(r.ok && r.data.label).toBe('Address');
  });
  it('rejects bad input, signed-out users and a sixth address', () => {
    expect(B.addAddress(ctx(), { ...address, zip: 'abc' })).toMatchObject({ ok: false, error: 'invalid_zip' });
    expect(B.addAddress(ctx(null), address)).toMatchObject({ ok: false, error: 'no_user' });
    for (let i = 0; i < 5; i++) expect(B.addAddress(ctx(), { ...address, line1: `${i + 1} Main Street` }).ok).toBe(true);
    expect(B.addAddress(ctx(), address)).toMatchObject({ ok: false, error: 'too_many_addresses' });
  });
  it('keeps each user’s addresses separate', () => {
    B.addAddress(ctx('seed_ana'), address);
    expect(B.billingFor(s, 'seed_leo').addresses).toHaveLength(0);
    const id = B.billingFor(s, 'seed_ana').addresses[0].id;
    expect(B.removeAddress(ctx('seed_leo'), id)).toMatchObject({ ok: false, error: 'address_not_found' });
  });
  it('removes an address and unlinks the cards billed to it', () => {
    const a = B.addAddress(ctx(), address);
    const id = a.ok ? a.data.id : '';
    B.addPaymentMethod(ctx(), { ...card, addressId: id });
    expect(B.removeAddress(ctx(), id)).toMatchObject({ ok: true });
    const b = B.billingFor(s, 'seed_ana');
    expect(b.addresses).toHaveLength(0);
    expect(b.payments[0].addressId).toBeNull();
    expect(B.removeAddress(ctx(), id)).toMatchObject({ ok: false, error: 'address_not_found' });
  });
});

describe('payment methods', () => {
  it('keeps the brand, last four digits and expiry and nothing else of the card', () => {
    const r = B.addPaymentMethod(ctx(), card);
    expect(r).toMatchObject({ ok: true, data: { brand: 'visa', last4: '4242', expMonth: 9, expYear: 2029, nameOnCard: 'Ana Demo', nickname: 'Everyday' } });
    const saved = B.billingFor(s, 'seed_ana').payments[0];
    expect(Object.keys(saved).sort()).toEqual(['addressId', 'brand', 'createdAt', 'expMonth', 'expYear', 'id', 'last4', 'nameOnCard', 'nickname']);
    expect(JSON.stringify(saved)).not.toContain('4242424242424242');
    expect(JSON.stringify(saved)).not.toContain('4242 4242');
  });
  it('rejects bad cards and signed-out users', () => {
    expect(B.addPaymentMethod(ctx(), { ...card, cardNumber: '4242 4242 4242 4241' })).toMatchObject({ ok: false, error: 'invalid_card_number' });
    expect(B.addPaymentMethod(ctx(), { ...card, expiry: '01/20' })).toMatchObject({ ok: false, error: 'card_expired' });
    expect(B.addPaymentMethod(ctx(), { ...card, cvc: '1' })).toMatchObject({ ok: false, error: 'invalid_cvc' });
    expect(B.addPaymentMethod(ctx(null), card)).toMatchObject({ ok: false, error: 'no_user' });
  });
  it('only links a billing address the user owns', () => {
    const kevins = B.billingFor(s, 'seed_kevin').addresses[0].id;
    expect(B.addPaymentMethod(ctx('seed_ana'), { ...card, addressId: kevins })).toMatchObject({ ok: false, error: 'address_not_found' });
    expect(B.addPaymentMethod(ctx('seed_kevin'), { ...card, cardNumber: '5555 5555 5555 4444', addressId: kevins }).ok).toBe(true);
  });
  it('rejects the same card twice and a sixth card', () => {
    expect(B.addPaymentMethod(ctx(), card).ok).toBe(true);
    expect(B.addPaymentMethod(ctx(), { ...card, nickname: 'Again' })).toMatchObject({ ok: false, error: 'duplicate_card' });
    const more = ['5555 5555 5555 4444', '3782 822463 10005', '6011 1111 1111 1117', '4111 1111 1111 1111'];
    for (const n of more) expect(B.addPaymentMethod(ctx(), { ...card, cardNumber: n, cvc: n.startsWith('37') ? '1234' : '123' }).ok).toBe(true);
    expect(B.addPaymentMethod(ctx(), { ...card, cardNumber: '4012 8888 8888 1881' })).toMatchObject({ ok: false, error: 'too_many_payments' });
  });
  it('removes a card', () => {
    const r = B.addPaymentMethod(ctx(), card);
    const id = r.ok ? r.data.id : '';
    expect(B.removePaymentMethod(ctx(), id)).toMatchObject({ ok: true });
    expect(B.billingFor(s, 'seed_ana').payments).toHaveLength(0);
    expect(B.removePaymentMethod(ctx(), id)).toMatchObject({ ok: false, error: 'payment_not_found' });
  });
});

describe('plan tier', () => {
  it('needs a working card to go paid', () => {
    expect(B.setPlanTier(ctx(), 'paid')).toMatchObject({ ok: false, error: 'payment_required' });
    B.addPaymentMethod(ctx(), card);
    expect(B.setPlanTier(ctx(), 'paid')).toMatchObject({ ok: true, data: 'paid' });
    expect(B.billingFor(s, 'seed_ana').tier).toBe('paid');
  });
  it('does not count an expired card', () => {
    B.addPaymentMethod(ctx(), { ...card, expiry: '10/26' });
    now = new Date('2026-11-02T12:00:00-04:00').getTime();
    expect(B.setPlanTier(ctx(), 'paid')).toMatchObject({ ok: false, error: 'payment_required' });
  });
  it('rejects the current tier and unknown tiers', () => {
    expect(B.setPlanTier(ctx(), 'free')).toMatchObject({ ok: false, error: 'same_tier' });
    expect(B.setPlanTier(ctx(), 'gold' as never)).toMatchObject({ ok: false, error: 'invalid_tier' });
    expect(B.setPlanTier(ctx(null), 'paid')).toMatchObject({ ok: false, error: 'no_user' });
  });
  it('keeps the last working card while paid, and lets it go after switching to free', () => {
    const a = B.addPaymentMethod(ctx(), card);
    const first = a.ok ? a.data.id : '';
    B.setPlanTier(ctx(), 'paid');
    expect(B.removePaymentMethod(ctx(), first)).toMatchObject({ ok: false, error: 'payment_in_use' });
    const b = B.addPaymentMethod(ctx(), { ...card, cardNumber: '5555 5555 5555 4444' });
    expect(B.removePaymentMethod(ctx(), first)).toMatchObject({ ok: true }); // a second card covers the plan
    expect(B.removePaymentMethod(ctx(), b.ok ? b.data.id : '')).toMatchObject({ ok: false, error: 'payment_in_use' });
    expect(B.setPlanTier(ctx(), 'free')).toMatchObject({ ok: true, data: 'free' });
    expect(B.removePaymentMethod(ctx(), b.ok ? b.data.id : '')).toMatchObject({ ok: true });
  });
});
