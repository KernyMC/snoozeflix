import { UserRound } from 'lucide-react';

export const AVATARS = [
  '/assets/avatar/01-coin-thief.png',
  '/assets/avatar/02-savings-buddy.png',
  '/assets/avatar/03-wallet-friend.png',
  '/assets/avatar/04-fist-bump.png',
  '/assets/avatar/05-pact-pals.png',
  '/assets/avatar/06-raccoon.png',
  '/assets/avatar/07-money-bag.png',
  '/assets/avatar/08-goal-buddy.png',
  '/assets/avatar/09-shared-pot.png',
  '/assets/avatar/10-high-five.png',
];

/** Image avatar (path starting with "/"); legacy emoji avatars render as text, and no avatar shows a person icon. */
export function Avatar({ value, size = 24, className = '' }: { value?: string; size?: number; className?: string }) {
  if (value?.startsWith('/')) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={value} alt="" width={size} height={size} className={`inline-block rounded-full object-cover align-middle ${className}`} style={{ width: size, height: size }} />;
  }
  if (!value) return <UserRound aria-hidden size={size} strokeWidth={2.5} className={`inline-block align-middle ${className}`} />;
  return <span className={className}>{value}</span>;
}
