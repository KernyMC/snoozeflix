import type { Address, AddressInput, CardBrand, ErrorCode, PaymentMethod, PaymentMethodInput } from './types';

export const MAX_PAYMENT_METHODS = 5;
export const MAX_ADDRESSES = 5;

/* ---------- plan ---------- */
/** Free days before the first charge. The card is charged on the day after the last free one. */
export const TRIAL_DAYS = 7;
/** The first charge of a trial started at `now`: the same time of day, `TRIAL_DAYS` calendar days later. */
export function trialEnd(now: number): number {
  const d = new Date(now);
  d.setDate(d.getDate() + TRIAL_DAYS);
  return d.getTime();
}
/** True while a paid plan is still inside its free trial. */
export const inTrial = (b: { tier: string; trialEndsAt?: number | null }, now: number): boolean =>
  b.tier === 'paid' && b.trialEndsAt != null && now < b.trialEndsAt;

export const BRAND_LABEL: Record<CardBrand, string> = { visa: 'Visa', mastercard: 'Mastercard', amex: 'American Express', discover: 'Discover' };

export const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO',
  'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
];

/* ---------- cards ---------- */
export const cardDigits = (v: string): string => v.replace(/[\s-]/g, '');

/** Brand from the leading digits, or null when it is not one we take. */
export function detectBrand(number: string): CardBrand | null {
  const d = cardDigits(number);
  if (/^4/.test(d)) return 'visa';
  if (/^3[47]/.test(d)) return 'amex';
  if (/^(6011|65|64[4-9])/.test(d)) return 'discover';
  const two = Number(d.slice(0, 2));
  const four = Number(d.slice(0, 4));
  if ((two >= 51 && two <= 55) || (d.length >= 4 && four >= 2221 && four <= 2720)) return 'mastercard';
  return null;
}

const BRAND_LENGTHS: Record<CardBrand, number[]> = { visa: [13, 16, 19], mastercard: [16], amex: [15], discover: [16, 19] };

export function luhnValid(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let n = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
  }
  return digits.length > 0 && sum % 10 === 0;
}

export function validateCardNumber(v: string): ErrorCode | null {
  const d = cardDigits(v);
  if (!/^\d{12,19}$/.test(d)) return 'invalid_card_number';
  const brand = detectBrand(d);
  if (!brand) return 'unsupported_card';
  return BRAND_LENGTHS[brand].includes(d.length) && luhnValid(d) ? null : 'invalid_card_number';
}

/** "MM/YY" or "MM/YYYY" → month 1–12 and a four-digit year. */
export function parseExpiry(v: string): { month: number; year: number } | null {
  const m = /^(\d{1,2})\s*\/\s*(\d{2}|\d{4})$/.exec(v.trim());
  if (!m) return null;
  const month = Number(m[1]);
  const year = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
  return month >= 1 && month <= 12 ? { month, year } : null;
}

/** A card is good through the last day of its expiry month. */
export const isExpired = (c: { expMonth: number; expYear: number }, now: number): boolean => now >= Date.UTC(c.expYear, c.expMonth, 1);

export function validateExpiry(v: string, now: number): ErrorCode | null {
  const e = parseExpiry(v);
  if (!e || e.year > new Date(now).getUTCFullYear() + 20) return 'invalid_expiry';
  return isExpired({ expMonth: e.month, expYear: e.year }, now) ? 'card_expired' : null;
}

export const validateCvc = (v: string, brand: CardBrand | null): ErrorCode | null =>
  new RegExp(`^\\d{${brand === 'amex' ? 4 : 3}}$`).test(v.trim()) ? null : 'invalid_cvc';

const PERSON_RE = /^[\p{L}][\p{L} .'-]*$/u;
export const validateCardName = (v: string): ErrorCode | null => {
  const t = v.trim();
  return t.length >= 2 && t.length <= 40 && PERSON_RE.test(t) ? null : 'invalid_card_name';
};
export const validateNickname = (v: string): ErrorCode | null => (v.trim().length <= 30 ? null : 'invalid_nickname');

export function validatePaymentInput(i: PaymentMethodInput, now: number): ErrorCode | null {
  return validateCardName(i.nameOnCard) ?? validateCardNumber(i.cardNumber) ?? validateExpiry(i.expiry, now)
    ?? validateCvc(i.cvc, detectBrand(i.cardNumber)) ?? validateNickname(i.nickname);
}

/** Groups digits while typing: 4-4-4-4, or 4-6-5 for American Express. */
export function formatCardNumber(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 19);
  const groups = detectBrand(d) === 'amex' ? [4, 6, 5] : [4, 4, 4, 4, 3];
  const out: string[] = [];
  let at = 0;
  for (const g of groups) {
    if (at >= d.length) break;
    out.push(d.slice(at, at + g));
    at += g;
  }
  return out.join(' ');
}

/** Adds the slash while typing: "0929" → "09/29". */
export function formatExpiryInput(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
}

export const formatExpiry = (c: Pick<PaymentMethod, 'expMonth' | 'expYear'>): string =>
  `${String(c.expMonth).padStart(2, '0')}/${String(c.expYear % 100).padStart(2, '0')}`;

/* ---------- addresses ---------- */
export const validateAddressLabel = (v: string): ErrorCode | null => (v.trim().length <= 20 ? null : 'invalid_label');
export const validateAddressName = (v: string): ErrorCode | null => {
  const t = v.trim();
  return t.length >= 2 && t.length <= 60 && PERSON_RE.test(t) ? null : 'invalid_address_name';
};
export const validateStreet = (v: string): ErrorCode | null => {
  const t = v.trim();
  return t.length >= 3 && t.length <= 60 ? null : 'invalid_street';
};
export const validateUnit = (v: string): ErrorCode | null => (v.trim().length <= 30 ? null : 'invalid_unit');
export const validateCity = (v: string): ErrorCode | null => {
  const t = v.trim();
  return t.length >= 2 && t.length <= 40 && PERSON_RE.test(t) ? null : 'invalid_city';
};
export const validateState = (v: string): ErrorCode | null => (US_STATES.includes(v.trim().toUpperCase()) ? null : 'invalid_state');
export const validateZip = (v: string): ErrorCode | null => (/^\d{5}(-\d{4})?$/.test(v.trim()) ? null : 'invalid_zip');

export function validateAddressInput(i: AddressInput): ErrorCode | null {
  return validateAddressLabel(i.label) ?? validateAddressName(i.fullName) ?? validateStreet(i.line1) ?? validateUnit(i.line2)
    ?? validateCity(i.city) ?? validateState(i.state) ?? validateZip(i.zip);
}

/** "123 Demo Street, Apt 4, Ann Arbor, MI 48104" */
export const formatAddress = (a: Pick<Address, 'line1' | 'line2' | 'city' | 'state' | 'zip'>): string =>
  [a.line1, a.line2, `${a.city}, ${a.state} ${a.zip}`].filter(Boolean).join(', ');
