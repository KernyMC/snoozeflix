'use client';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useState } from 'react';
import { encodeSnapshot, useSquad, useSquadMembers, type InviteSnapshot } from '@/data';

/** Normalises a typed or scanned invite code: capitals and digits only, at most 8 characters. */
export function cleanCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}

/** Reads the invite code a QR or share link carried in `?join=`. */
export function joinParam(params: { get(name: string): string | null }): string {
  return cleanCode(params.get('join') ?? '');
}

/** Appends the carried invite code (and the squad snapshot, if any) to a route, so it survives sign-in and sign-up. */
export function withJoin(path: string, code: string, snapshot?: string | null): string {
  return code ? `${path}?join=${encodeURIComponent(code)}${snapshot ? `&s=${encodeURIComponent(snapshot)}` : ''}` : path;
}

/** Where to go once signed in: back to the invite card when a code rode along, otherwise the squad setup. */
export function afterAuth(code: string, snapshot?: string | null): string {
  return code ? `/join?code=${encodeURIComponent(code)}${snapshot ? `&s=${encodeURIComponent(snapshot)}` : ''}` : '/onboarding';
}

/**
 * Where an invite sends people: the quick-join screen. The squad's details ride along in `s`, so the link also works on a
 * device that has never seen the squad (the mock backend lives in each browser).
 */
export function inviteUrl(origin: string, code: string, snapshot?: InviteSnapshot | null): string {
  return `${origin}/join?code=${encodeURIComponent(code)}${snapshot ? `&s=${encodeSnapshot(snapshot)}` : ''}`;
}

/** The current squad as an invite snapshot, or null when there is none. */
export function useInviteSnapshot(): InviteSnapshot | null {
  const squad = useSquad();
  const members = useSquadMembers();
  if (!squad) return null;
  const owner = members[0];
  return {
    code: squad.inviteCode, id: squad.id, name: squad.name, poolGoalName: squad.poolGoalName, poolGoalCents: squad.poolGoalCents,
    ...(owner ? { ownerName: owner.name, ownerAvatar: owner.avatar } : {}),
  };
}

/** QR code a new member scans to create an account and join this squad. */
export function InviteQr({ code, size = 96, className = '' }: { code: string; size?: number; className?: string }) {
  const [origin, setOrigin] = useState('');
  const snapshot = useInviteSnapshot();
  useEffect(() => { setOrigin(window.location.origin); }, []);
  const box = size + 20; // 8px quiet zone + 2px border on each side
  return (
    <span className={`grid shrink-0 place-items-center rounded-xl border-2 border-surface-line bg-white text-ink ${className}`} style={{ width: box, height: box }}>
      {origin && (
        <QRCodeSVG value={inviteUrl(origin, code, snapshot)} size={size} fgColor="currentColor" bgColor="transparent"
          title={`QR code to join with invite code ${code}`} />
      )}
    </span>
  );
}
