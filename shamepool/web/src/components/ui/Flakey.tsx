'use client';
import { motion, useReducedMotion } from 'framer-motion';

export type Mood = 'happy' | 'cheer' | 'worried' | 'melting' | 'smug' | 'sleepy';

/** Mascot: Benny the Penny. One image; mood is expressed through motion. */
export function Flakey({ mood = 'happy', size = 120, className = '' }: { mood?: Mood; size?: number; className?: string }) {
  const reduce = useReducedMotion();
  const loop = (duration: number) => ({ repeat: Infinity, duration, ease: 'easeInOut' as const });

  let animate: Record<string, number[] | number> | undefined;
  let transition: ReturnType<typeof loop> | undefined;
  if (!reduce) {
    if (mood === 'happy') { animate = { y: [0, -4, 0] }; transition = loop(1.8); }
    else if (mood === 'cheer') { animate = { y: [0, -8, 0], rotate: [-4, 4, -4] }; transition = loop(0.6); }
    else if (mood === 'worried') { animate = { x: [0, -2, 2, 0] }; transition = loop(0.5); }
  }
  const style =
    mood === 'melting' ? { transform: 'scaleY(0.85)', transformOrigin: 'bottom' }
    : mood === 'sleepy' ? { transform: 'rotate(-8deg)', opacity: 0.8 }
    : undefined;

  return (
    <motion.img
      src="/assets/Shamepool-Benny-the-Penny.png" width={size} height={size} className={`object-contain ${className}`}
      alt={`Benny the Penny, feeling ${mood}`} style={{ width: size, height: size, ...style }}
      animate={animate} transition={transition}
    />
  );
}
