'use client';
import { useRef, useState } from 'react';
import { Crown, MapPin, Plus, Sprout, Trash2 } from 'lucide-react';
import {
  addAddress, addPaymentMethod, BRAND_LABEL, detectBrand, formatAddress, formatCardNumber, formatExpiry, formatExpiryInput, isExpired,
  MAX_ADDRESSES, MAX_PAYMENT_METHODS, removeAddress, removePaymentMethod, setPlanTier, useBilling, useConnection, useNow,
  validateAddressLabel, validateAddressName, validateCardName, validateCardNumber, validateCity, validateCvc, validateExpiry, validateNickname,
  validateState, validateStreet, validateUnit, validateZip, type Address, type ErrorCode, type PaymentMethod, type Result,
} from '@/data';
import { type Errs, FormError, useErrors } from '@/components/AccountParts';
import { focusFirstInvalid } from '@/components/auth/AuthShell';
import { fireConfetti } from '@/components/effects';
import { Button } from '@/components/ui/Button';
import { Card, Pill } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { errorText } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';

const label = 'block text-xs font-extrabold uppercase tracking-wide text-ink-soft mb-1.5';
const cardTitle = (p: PaymentMethod) => `${BRAND_LABEL[p.brand]} ending in ${p.last4}`;

export const paymentSummary = (list: PaymentMethod[]): string =>
  list.length === 0 ? 'No cards saved' : list.length === 1 ? cardTitle(list[0]) : `${list.length} cards saved`;
export const addressSummary = (list: Address[]): string =>
  list.length === 0 ? 'No addresses saved' : list.length === 1 ? `${list[0].label}: ${list[0].line1}` : `${list.length} addresses saved`;

/* ---------- plan ---------- */
export function TierPill({ className = '' }: { className?: string }) {
  const { tier } = useBilling();
  return <Pill tone={tier === 'paid' ? 'sky' : 'gray'} className={className}>{tier === 'paid' ? 'Paid tier' : 'Free tier'}</Pill>;
}

/** Which tier the user is on, with the switch to the other one. Going paid needs a saved card that has not expired. */
export function PlanCard() {
  const billing = useBilling();
  const now = useNow(60_000);
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const paid = billing.tier === 'paid';
  const hasCard = billing.payments.some((p) => !isExpired(p, now));

  const change = async () => {
    if (busy) return;
    setBusy(true);
    const r = await setPlanTier(paid ? 'free' : 'paid');
    setBusy(false);
    if (!r.ok) return toast(errorText(r.error), 'error');
    if (r.data === 'paid') fireConfetti();
    toast(r.data === 'paid' ? 'You are on the paid tier' : 'You are back on the free tier', 'success');
  };

  return (
    <Card tone={paid ? 'sky' : 'default'} className="space-y-4">
      <div className="flex items-center gap-3">
        <span className={`size-12 rounded-xl grid place-items-center shrink-0 ${paid ? 'bg-white text-sky-dark' : 'bg-surface-muted text-ink-soft'}`} aria-hidden>
          {paid ? <Crown size={26} strokeWidth={2.5} /> : <Sprout size={26} strokeWidth={2.5} />}
        </span>
        <div className="min-w-0">
          <p className="text-xs font-extrabold uppercase tracking-wide text-ink-soft">Your plan</p>
          <p className="font-display font-black text-2xl leading-tight">{paid ? 'Paid tier' : 'Free tier'}</p>
        </div>
      </div>
      {paid ? (
        <Button variant="secondary" type="button" loading={busy} onClick={change}>Switch to free</Button>
      ) : (
        <>
          <Button type="button" loading={busy} disabled={!hasCard} onClick={change}>Upgrade to paid</Button>
          {!hasCard && <p className="text-sm font-bold text-ink-soft text-center">Save a card under Payment methods to upgrade.</p>}
        </>
      )}
    </Card>
  );
}

/* ---------- shared: remove with a second tap to confirm ---------- */
function RemoveButton({ what, onRemove }: { what: string; onRemove: () => Promise<Result<true>> }) {
  const { toast } = useToast();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const small = 'min-h-11 py-2 px-4 text-sm';

  const go = async () => {
    setBusy(true);
    const r = await onRemove();
    // On success the row unmounts with the item, so there is no state left to reset.
    if (!r.ok) { setBusy(false); setAsking(false); toast(errorText(r.error), 'error'); } else toast(`${what} removed`, 'success');
  };

  if (!asking) {
    return (
      <Button variant="secondary" full={false} type="button" className={`${small} !text-ember-dark`} onClick={() => setAsking(true)}>
        <Trash2 aria-hidden size={18} strokeWidth={2.5} />Remove
      </Button>
    );
  }
  return (
    <div className="space-y-2" role="group" aria-label={`Remove this ${what.toLowerCase()}?`}>
      <p className="text-sm font-extrabold text-ember-dark">Remove this {what.toLowerCase()}?</p>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" type="button" className={small} disabled={busy} onClick={() => setAsking(false)}>Keep</Button>
        <Button variant="danger" type="button" className={small} loading={busy} onClick={go}>Remove</Button>
      </div>
    </div>
  );
}

/* ---------- payment methods ---------- */
function PaymentCard({ p, address, now }: { p: PaymentMethod; address: Address | undefined; now: number }) {
  const expired = isExpired(p, now);
  return (
    <li className="rounded-2xl border-2 border-surface-line bg-white overflow-hidden shadow-chunky-sm">
      <div className="bg-primary text-white p-4 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <p className="font-display font-black text-lg leading-tight break-words min-w-0">{p.nickname || BRAND_LABEL[p.brand]}</p>
          <span className="shrink-0 rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-extrabold uppercase tracking-wide">{BRAND_LABEL[p.brand]}</span>
        </div>
        <p className="font-display font-black text-xl tracking-widest tabular" aria-label={cardTitle(p)}>•••• •••• •••• {p.last4}</p>
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-white/60">Name on card</p>
            <p className="font-extrabold truncate">{p.nameOnCard}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-white/60">Expires</p>
            <p className="font-extrabold tabular">{formatExpiry(p)}</p>
          </div>
        </div>
      </div>
      <div className="p-3 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-ink-faint">Billing address</p>
            <p className="font-bold text-ink-soft break-words">{address ? formatAddress(address) : 'None'}</p>
          </div>
          <Pill tone={expired ? 'ember' : 'leaf'} className="shrink-0 mt-0.5">{expired ? 'Expired' : 'Active'}</Pill>
        </div>
        <RemoveButton what="Card" onRemove={() => removePaymentMethod(p.id)} />
      </div>
    </li>
  );
}

function PaymentForm({ addresses, onDone }: { addresses: Address[]; onDone: () => void }) {
  const { toast } = useToast();
  const now = useNow(60_000);
  const mock = useConnection().mode === 'mock';
  const [f, setF] = useState({ nameOnCard: '', cardNumber: '', expiry: '', cvc: '', nickname: '' });
  const [addressId, setAddressId] = useState('');
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLFormElement>(null);
  const brand = detectBrand(f.cardNumber);

  const validate = (): Errs => {
    const e: Errs = {};
    const put = (k: string, c: ErrorCode | null) => { if (c) e[k] = errorText(c); };
    put('name', validateCardName(f.nameOnCard));
    put('number', validateCardNumber(f.cardNumber));
    put('expiry', validateExpiry(f.expiry, now));
    put('cvc', validateCvc(f.cvc, brand));
    put('nickname', validateNickname(f.nickname));
    return e;
  };
  const { err, setErr, formErr, setFormErr, blur, clear, reject } = useErrors(validate);
  /** `errKey` is the name the field's error is filed under. */
  const set = (k: keyof typeof f, errKey: string, v: string) => { setF((p) => ({ ...p, [k]: v })); clear(errKey); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setFormErr('');
    const v = validate();
    setErr(v);
    if (Object.keys(v).length) return focusFirstInvalid(ref.current);
    setBusy(true);
    const r = await addPaymentMethod({ ...f, addressId: addressId || null });
    setBusy(false);
    if (!r.ok) {
      return reject(r.error, {
        invalid_card_name: 'name', invalid_card_number: 'number', unsupported_card: 'number', duplicate_card: 'number',
        invalid_expiry: 'expiry', card_expired: 'expiry', invalid_cvc: 'cvc', invalid_nickname: 'nickname',
      }, ref.current);
    }
    toast('Card saved', 'success');
    onDone();
  };

  return (
    <form ref={ref} onSubmit={submit} noValidate className="space-y-4 rounded-xl border-2 border-surface-line p-3">
      <p className="font-display font-black text-lg">New card</p>
      <Field label="Name on card" value={f.nameOnCard} onChange={(e) => set('nameOnCard', 'name', e.target.value)} onBlur={blur('name')} error={err.name}
        maxLength={40} placeholder="Jane Doe" autoComplete="cc-name" enterKeyHint="next" />
      <Field label="Card number" value={f.cardNumber} onChange={(e) => set('cardNumber', 'number', formatCardNumber(e.target.value))} onBlur={blur('number')}
        error={err.number} hint={brand ? BRAND_LABEL[brand] : 'Visa, Mastercard, American Express or Discover.'}
        maxLength={23} placeholder="1234 5678 9012 3456" inputMode="numeric" autoComplete="cc-number" enterKeyHint="next" className="tabular" />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Expiry" value={f.expiry} onChange={(e) => set('expiry', 'expiry', formatExpiryInput(e.target.value))} onBlur={blur('expiry')} error={err.expiry}
          maxLength={5} placeholder="MM/YY" inputMode="numeric" autoComplete="cc-exp" enterKeyHint="next" className="tabular" />
        <Field label="Security code" value={f.cvc} onChange={(e) => set('cvc', 'cvc', e.target.value.replace(/\D/g, '').slice(0, 4))} onBlur={blur('cvc')}
          error={err.cvc} maxLength={4} placeholder={brand === 'amex' ? '4 digits' : '3 digits'} inputMode="numeric" autoComplete="cc-csc" enterKeyHint="next" className="tabular" />
      </div>
      <Field label="Nickname (optional)" value={f.nickname} onChange={(e) => set('nickname', 'nickname', e.target.value)} onBlur={blur('nickname')} error={err.nickname}
        maxLength={30} placeholder="Everyday card" autoComplete="off" enterKeyHint="done" />
      {addresses.length > 0 ? (
        <div>
          <label htmlFor="pm-address" className={label}>Billing address (optional)</label>
          <Select id="pm-address" value={addressId} onChange={setAddressId}
            options={[{ value: '', label: 'No billing address' }, ...addresses.map((a) => ({ value: a.id, label: `${a.label}: ${formatAddress(a)}` }))]} />
        </div>
      ) : (
        <div>
          <p className={label}>Billing address (optional)</p>
          <p className="text-sm font-bold text-ink-faint">Save one under Addresses first to bill a card to it.</p>
        </div>
      )}
      <p className="text-xs font-bold text-ink-faint">
        Only the card type, last 4 digits and expiry are saved.{mock && ' This is demo mode, so use a test number like 4242 4242 4242 4242.'}
      </p>
      <FormError text={formErr} />
      <div className="grid grid-cols-2 gap-3">
        <Button variant="secondary" type="button" disabled={busy} onClick={onDone}>Cancel</Button>
        <Button type="submit" loading={busy}>Save</Button>
      </div>
    </form>
  );
}

export function PaymentMethods() {
  const { payments, addresses } = useBilling();
  const now = useNow(60_000);
  const [adding, setAdding] = useState(false);
  const full = payments.length >= MAX_PAYMENT_METHODS;
  return (
    <div className="space-y-3">
      {payments.length === 0 && !adding && <p className="font-bold text-ink-soft">No cards yet. Save one to use it for the paid tier.</p>}
      {payments.length > 0 && (
        <ul className="space-y-3" aria-label="Saved cards">
          {payments.map((p) => <PaymentCard key={p.id} p={p} now={now} address={addresses.find((a) => a.id === p.addressId)} />)}
        </ul>
      )}
      {adding ? <PaymentForm addresses={addresses} onDone={() => setAdding(false)} />
        : full ? <p className="text-sm font-bold text-ink-faint text-center">That is the limit of {MAX_PAYMENT_METHODS} cards. Remove one to add another.</p>
          : <Button variant="secondary" type="button" onClick={() => setAdding(true)}><Plus aria-hidden size={20} strokeWidth={3} />Add payment method</Button>}
    </div>
  );
}

/* ---------- addresses ---------- */
function AddressCard({ a, cards }: { a: Address; cards: PaymentMethod[] }) {
  return (
    <li className="rounded-2xl border-2 border-surface-line bg-white p-3 space-y-3 shadow-chunky-sm">
      <div className="flex items-start gap-3">
        <span className="size-10 rounded-xl bg-sky-light text-sky-dark grid place-items-center shrink-0" aria-hidden><MapPin size={22} strokeWidth={2.5} /></span>
        <div className="min-w-0 flex-1">
          <p className="font-display font-black text-lg leading-tight break-words">{a.label}</p>
          <p className="font-extrabold break-words">{a.fullName}</p>
          <p className="font-bold text-ink-soft break-words">{a.line1}{a.line2 && `, ${a.line2}`}</p>
          <p className="font-bold text-ink-soft break-words">{a.city}, {a.state} {a.zip}</p>
        </div>
      </div>
      {cards.length > 0 && (
        <p className="text-sm font-bold text-ink-soft">Billing address for {cards.map((c) => `${BRAND_LABEL[c.brand]} ${c.last4}`).join(', ')}</p>
      )}
      <RemoveButton what="Address" onRemove={() => removeAddress(a.id)} />
    </li>
  );
}

function AddressForm({ onDone }: { onDone: () => void }) {
  const { toast } = useToast();
  const [f, setF] = useState({ label: '', fullName: '', line1: '', line2: '', city: '', state: '', zip: '' });
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLFormElement>(null);

  const validate = (): Errs => {
    const e: Errs = {};
    const put = (k: string, c: ErrorCode | null) => { if (c) e[k] = errorText(c); };
    put('label', validateAddressLabel(f.label));
    put('fullName', validateAddressName(f.fullName));
    put('line1', validateStreet(f.line1));
    put('line2', validateUnit(f.line2));
    put('city', validateCity(f.city));
    put('state', validateState(f.state));
    put('zip', validateZip(f.zip));
    return e;
  };
  const { err, setErr, formErr, setFormErr, blur, clear, reject } = useErrors(validate);
  const set = (k: keyof typeof f, v: string) => { setF((p) => ({ ...p, [k]: v })); clear(k); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setFormErr('');
    const v = validate();
    setErr(v);
    if (Object.keys(v).length) return focusFirstInvalid(ref.current);
    setBusy(true);
    const r = await addAddress(f);
    setBusy(false);
    if (!r.ok) {
      return reject(r.error, {
        invalid_label: 'label', invalid_address_name: 'fullName', invalid_street: 'line1', invalid_unit: 'line2',
        invalid_city: 'city', invalid_state: 'state', invalid_zip: 'zip',
      }, ref.current);
    }
    toast('Address saved', 'success');
    onDone();
  };

  return (
    <form ref={ref} onSubmit={submit} noValidate className="space-y-4 rounded-xl border-2 border-surface-line p-3">
      <p className="font-display font-black text-lg">New address</p>
      <Field label="Label (optional)" value={f.label} onChange={(e) => set('label', e.target.value)} onBlur={blur('label')} error={err.label}
        maxLength={20} placeholder="Home" autoComplete="off" enterKeyHint="next" />
      <Field label="Full name" value={f.fullName} onChange={(e) => set('fullName', e.target.value)} onBlur={blur('fullName')} error={err.fullName}
        maxLength={60} placeholder="Jane Doe" autoComplete="name" enterKeyHint="next" />
      <Field label="Street address" value={f.line1} onChange={(e) => set('line1', e.target.value)} onBlur={blur('line1')} error={err.line1}
        maxLength={60} placeholder="123 Main Street" autoComplete="address-line1" enterKeyHint="next" />
      <Field label="Apartment or suite (optional)" value={f.line2} onChange={(e) => set('line2', e.target.value)} onBlur={blur('line2')} error={err.line2}
        maxLength={30} placeholder="Apt 4" autoComplete="address-line2" enterKeyHint="next" />
      <Field label="City" value={f.city} onChange={(e) => set('city', e.target.value)} onBlur={blur('city')} error={err.city}
        maxLength={40} placeholder="Ann Arbor" autoComplete="address-level2" enterKeyHint="next" />
      <div className="grid grid-cols-2 gap-3">
        <Field label="State" value={f.state} onChange={(e) => set('state', e.target.value.replace(/[^a-z]/gi, '').toUpperCase().slice(0, 2))} onBlur={blur('state')}
          error={err.state} maxLength={2} placeholder="MI" autoComplete="address-level1" autoCapitalize="characters" enterKeyHint="next" />
        <Field label="ZIP code" value={f.zip} onChange={(e) => set('zip', e.target.value.replace(/[^\d-]/g, '').slice(0, 10))} onBlur={blur('zip')}
          error={err.zip} maxLength={10} placeholder="48104" inputMode="numeric" autoComplete="postal-code" enterKeyHint="done" className="tabular" />
      </div>
      <FormError text={formErr} />
      <div className="grid grid-cols-2 gap-3">
        <Button variant="secondary" type="button" disabled={busy} onClick={onDone}>Cancel</Button>
        <Button type="submit" loading={busy}>Save</Button>
      </div>
    </form>
  );
}

export function Addresses() {
  const { payments, addresses } = useBilling();
  const [adding, setAdding] = useState(false);
  const full = addresses.length >= MAX_ADDRESSES;
  return (
    <div className="space-y-3">
      {addresses.length === 0 && !adding && <p className="font-bold text-ink-soft">No addresses yet. Save one to bill a card to it.</p>}
      {addresses.length > 0 && (
        <ul className="space-y-3" aria-label="Saved addresses">
          {addresses.map((a) => <AddressCard key={a.id} a={a} cards={payments.filter((p) => p.addressId === a.id)} />)}
        </ul>
      )}
      {adding ? <AddressForm onDone={() => setAdding(false)} />
        : full ? <p className="text-sm font-bold text-ink-faint text-center">That is the limit of {MAX_ADDRESSES} addresses. Remove one to add another.</p>
          : <Button variant="secondary" type="button" onClick={() => setAdding(true)}><Plus aria-hidden size={20} strokeWidth={3} />Add address</Button>}
    </div>
  );
}
