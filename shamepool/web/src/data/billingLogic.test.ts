import { describe, expect, it } from 'vitest';
import {
  detectBrand, formatAddress, formatCardNumber, formatExpiry, formatExpiryInput, isExpired, luhnValid, parseExpiry, validateAddressInput,
  validateCardNumber, validateCvc, validateExpiry, validatePaymentInput, validateState, validateZip,
} from './billingLogic';

const NOW = Date.UTC(2026, 9, 7, 16); // 7 Oct 2026

describe('card number', () => {
  it('detects the brand from the leading digits', () => {
    expect(detectBrand('4242 4242 4242 4242')).toBe('visa');
    expect(detectBrand('5555555555554444')).toBe('mastercard');
    expect(detectBrand('2223003122003222')).toBe('mastercard');
    expect(detectBrand('3782 822463 10005')).toBe('amex');
    expect(detectBrand('6011111111111117')).toBe('discover');
    expect(detectBrand('9999999999999995')).toBeNull();
  });
  it('checks the Luhn digit', () => {
    expect(luhnValid('4242424242424242')).toBe(true);
    expect(luhnValid('4242424242424241')).toBe(false);
    expect(luhnValid('')).toBe(false);
  });
  it('accepts real test numbers with spaces or dashes and rejects the rest', () => {
    expect(validateCardNumber('4242 4242 4242 4242')).toBeNull();
    expect(validateCardNumber('5555-5555-5555-4444')).toBeNull();
    expect(validateCardNumber('378282246310005')).toBeNull();
    expect(validateCardNumber('6011111111111117')).toBeNull();
    expect(validateCardNumber('4242 4242 4242 4241')).toBe('invalid_card_number'); // bad check digit
    expect(validateCardNumber('4242 4242 4242')).toBe('invalid_card_number'); // wrong length for Visa
    expect(validateCardNumber('abcd')).toBe('invalid_card_number');
    expect(validateCardNumber('')).toBe('invalid_card_number');
    expect(validateCardNumber('9999 9999 9999 9995')).toBe('unsupported_card');
  });
  it('groups digits while typing', () => {
    expect(formatCardNumber('4242424242424242')).toBe('4242 4242 4242 4242');
    expect(formatCardNumber('42424')).toBe('4242 4');
    expect(formatCardNumber('378282246310005')).toBe('3782 822463 10005');
    expect(formatCardNumber('4242-4242 x')).toBe('4242 4242');
  });
});

describe('expiry', () => {
  it('parses MM/YY and MM/YYYY', () => {
    expect(parseExpiry('09/29')).toEqual({ month: 9, year: 2029 });
    expect(parseExpiry('9/2029')).toEqual({ month: 9, year: 2029 });
    expect(parseExpiry('13/29')).toBeNull();
    expect(parseExpiry('0929')).toBeNull();
  });
  it('is good through the last day of the month', () => {
    expect(validateExpiry('10/26', NOW)).toBeNull(); // this month
    expect(validateExpiry('09/26', NOW)).toBe('card_expired'); // last month
    expect(validateExpiry('01/20', NOW)).toBe('card_expired');
    expect(validateExpiry('nope', NOW)).toBe('invalid_expiry');
    expect(validateExpiry('01/99', NOW)).toBe('invalid_expiry'); // more than 20 years out
    expect(isExpired({ expMonth: 10, expYear: 2026 }, NOW)).toBe(false);
    expect(isExpired({ expMonth: 10, expYear: 2026 }, Date.UTC(2026, 10, 1))).toBe(true);
  });
  it('formats for typing and for display', () => {
    expect(formatExpiryInput('0929')).toBe('09/29');
    expect(formatExpiryInput('09')).toBe('09');
    expect(formatExpiryInput('09/2')).toBe('09/2');
    expect(formatExpiry({ expMonth: 9, expYear: 2029 })).toBe('09/29');
  });
});

describe('security code', () => {
  it('is 3 digits, or 4 for American Express', () => {
    expect(validateCvc('123', 'visa')).toBeNull();
    expect(validateCvc('1234', 'visa')).toBe('invalid_cvc');
    expect(validateCvc('1234', 'amex')).toBeNull();
    expect(validateCvc('123', 'amex')).toBe('invalid_cvc');
    expect(validateCvc('12a', null)).toBe('invalid_cvc');
  });
});

describe('validatePaymentInput', () => {
  const good = { nickname: 'Everyday', nameOnCard: 'Jane Doe', cardNumber: '4242 4242 4242 4242', expiry: '09/29', cvc: '123', addressId: null };
  it('passes a complete card and names the first bad field', () => {
    expect(validatePaymentInput(good, NOW)).toBeNull();
    expect(validatePaymentInput({ ...good, nickname: '' }, NOW)).toBeNull(); // nickname is optional
    expect(validatePaymentInput({ ...good, nameOnCard: 'J' }, NOW)).toBe('invalid_card_name');
    expect(validatePaymentInput({ ...good, cardNumber: '1234' }, NOW)).toBe('invalid_card_number');
    expect(validatePaymentInput({ ...good, expiry: '01/20' }, NOW)).toBe('card_expired');
    expect(validatePaymentInput({ ...good, cvc: '12' }, NOW)).toBe('invalid_cvc');
    expect(validatePaymentInput({ ...good, nickname: 'x'.repeat(31) }, NOW)).toBe('invalid_nickname');
  });
});

describe('address', () => {
  const good = { label: 'Home', fullName: 'Jane Doe', line1: '123 Demo Street', line2: '', city: 'Ann Arbor', state: 'mi', zip: '48104' };
  it('passes a complete address and names the first bad field', () => {
    expect(validateAddressInput(good)).toBeNull();
    expect(validateAddressInput({ ...good, label: '' })).toBeNull(); // label is optional
    expect(validateAddressInput({ ...good, label: 'x'.repeat(21) })).toBe('invalid_label');
    expect(validateAddressInput({ ...good, fullName: '' })).toBe('invalid_address_name');
    expect(validateAddressInput({ ...good, line1: 'a' })).toBe('invalid_street');
    expect(validateAddressInput({ ...good, line2: 'x'.repeat(31) })).toBe('invalid_unit');
    expect(validateAddressInput({ ...good, city: '' })).toBe('invalid_city');
    expect(validateAddressInput({ ...good, state: 'ZZ' })).toBe('invalid_state');
    expect(validateAddressInput({ ...good, zip: '4810' })).toBe('invalid_zip');
  });
  it('accepts state codes in any case and ZIP+4', () => {
    expect(validateState(' mi ')).toBeNull();
    expect(validateState('Michigan')).toBe('invalid_state');
    expect(validateZip('48104-1234')).toBeNull();
    expect(validateZip('48104-12')).toBe('invalid_zip');
  });
  it('formats on one line, skipping an empty second line', () => {
    expect(formatAddress({ ...good, state: 'MI' })).toBe('123 Demo Street, Ann Arbor, MI 48104');
    expect(formatAddress({ ...good, line2: 'Apt 4', state: 'MI' })).toBe('123 Demo Street, Apt 4, Ann Arbor, MI 48104');
  });
});
