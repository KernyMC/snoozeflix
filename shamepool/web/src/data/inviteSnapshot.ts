// A scanned invite has to work on a phone that has never seen the squad, so the link carries a small, validated snapshot of it.
import { normalizeInviteCode, validateName, validatePoolGoal } from './logic';
import type { InviteSnapshot } from './types';

const CODE = /^[A-Z0-9]{4,8}$/;
const SQUAD_ID = /^sq_[a-z0-9]{1,16}$/;
const MAX_ENCODED = 1200;

const toB64 = (s: string) => {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64 = (s: string) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0)));
};

/** True when every field is something the engine may safely materialise. Link contents are untrusted input. */
export function isValidSnapshot(x: unknown): x is InviteSnapshot {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  const str = (k: string, max: number) => typeof o[k] === 'string' && (o[k] as string).trim().length >= 1 && (o[k] as string).length <= max;
  return typeof o.code === 'string' && CODE.test(normalizeInviteCode(o.code))
    && typeof o.id === 'string' && SQUAD_ID.test(o.id)
    && str('name', 30) && str('poolGoalName', 30)
    && typeof o.poolGoalCents === 'number' && validatePoolGoal(o.poolGoalCents) === null
    && (o.ownerName === undefined || (typeof o.ownerName === 'string' && validateName(o.ownerName) === null))
    && (o.ownerAvatar === undefined || (typeof o.ownerAvatar === 'string' && /^\/assets\/avatar\/[\w.-]+\.png$/.test(o.ownerAvatar)));
}

export function encodeSnapshot(s: InviteSnapshot): string {
  return toB64(JSON.stringify(s));
}

/** Returns null for anything missing, oversized, malformed or invalid. Never throws. */
export function decodeSnapshot(raw: string | null | undefined): InviteSnapshot | null {
  if (!raw || raw.length > MAX_ENCODED) return null;
  try {
    const o = JSON.parse(fromB64(raw));
    return isValidSnapshot(o) ? { ...o, code: normalizeInviteCode(o.code) } : null;
  } catch { return null; }
}
