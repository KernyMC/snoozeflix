'use client';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useState } from 'react';

/** Reads the invite code a QR or share link carried in `?join=`, cleaned up for display and reuse. */
export function joinParam(params: { get(name: string): string | null }): string {
  return (params.get('join') ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}

/** Appends the carried invite code to a route, so it survives sign-in and sign-up. */
export function withJoin(path: string, code: string): string {
  return code ? `${path}?join=${encodeURIComponent(code)}` : path;
}

/** Where an invite sends people: sign-up, with the squad's code carried through to the join step. */
export function inviteUrl(origin: string, code: string): string {
  return origin + withJoin('/register', code);
}

/** QR code a new member scans to create an account and join this squad. */
export function InviteQr({ code, size = 96, className = '' }: { code: string; size?: number; className?: string }) {
  const [origin, setOrigin] = useState('');
  useEffect(() => { setOrigin(window.location.origin); }, []);
  const box = size + 20; // 8px quiet zone + 2px border on each side
  return (
    <span className={`grid shrink-0 place-items-center rounded-xl border-2 border-surface-line bg-white text-ink ${className}`} style={{ width: box, height: box }}>
      {origin && (
        <QRCodeSVG value={inviteUrl(origin, code)} size={size} fgColor="currentColor" bgColor="transparent"
          title={`QR code to sign up and join with invite code ${code}`} />
      )}
    </span>
  );
}
