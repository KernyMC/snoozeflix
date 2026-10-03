'use client';
import { motion, useReducedMotion } from 'framer-motion';

export type Mood = 'happy' | 'cheer' | 'worried' | 'melting' | 'smug' | 'sleepy';

const OUT = '#24215B';
const BODY = '#BFE3E1';
const ARM = '#75BFBC';

/** Original mascot: a chubby snowflake. Flat colors, 3 px outline. */
export function Flakey({ mood = 'happy', size = 120, className = '' }: { mood?: Mood; size?: number; className?: string }) {
  const reduce = useReducedMotion();
  const bob = !reduce && (mood === 'happy' || mood === 'cheer');
  const melting = mood === 'melting';
  return (
    <motion.svg
      viewBox="0 0 120 120" width={size} height={size} className={className} role="img" aria-label={`Flakey, feeling ${mood}`}
      animate={bob ? { y: [0, -4, 0] } : undefined}
      transition={bob ? { repeat: Infinity, duration: mood === 'cheer' ? 0.6 : 1.8, ease: 'easeInOut' } : undefined}
    >
      {melting && <ellipse cx="60" cy="108" rx="40" ry="8" fill={ARM} opacity="0.55" />}
      <g transform={melting ? 'translate(0 12) scale(1 0.82)' : undefined} style={{ transformOrigin: '60px 60px' }}>
        {[0, 60, 120].map((r) => (
          <rect key={r} x="56" y="6" width="8" height="108" rx="4" fill={ARM} stroke={OUT} strokeWidth="3" transform={`rotate(${r} 60 60)`} />
        ))}
        <circle cx="60" cy="60" r="36" fill={BODY} stroke={OUT} strokeWidth="3" />
        <circle cx="48" cy="46" r="6" fill="#fff" opacity="0.6" />
        {/* eyes + mouth per mood */}
        {mood === 'happy' && (<>
          <circle cx="48" cy="58" r="5" fill={OUT} /><circle cx="72" cy="58" r="5" fill={OUT} />
          <path d="M48 72 Q60 84 72 72" stroke={OUT} strokeWidth="3.5" fill="none" strokeLinecap="round" />
        </>)}
        {mood === 'cheer' && (<>
          <path d="M42 60 Q48 52 54 60" stroke={OUT} strokeWidth="3.5" fill="none" strokeLinecap="round" />
          <path d="M66 60 Q72 52 78 60" stroke={OUT} strokeWidth="3.5" fill="none" strokeLinecap="round" />
          <path d="M46 70 Q60 90 74 70 Z" fill="#fff" stroke={OUT} strokeWidth="3" strokeLinejoin="round" />
          <text x="6" y="22" fontSize="18" fill="#F6C445">✦</text><text x="96" y="30" fontSize="14" fill="#D98A2B">✦</text>
        </>)}
        {mood === 'worried' && (<>
          <circle cx="48" cy="60" r="5" fill={OUT} /><circle cx="72" cy="60" r="5" fill={OUT} />
          <path d="M40 48 L54 52 M80 48 L66 52" stroke={OUT} strokeWidth="3" strokeLinecap="round" />
          <path d="M48 78 Q54 72 60 78 Q66 84 72 78" stroke={OUT} strokeWidth="3.5" fill="none" strokeLinecap="round" />
          <path d="M92 40 Q98 52 92 56 Q86 52 92 40 Z" fill="#75BFBC" stroke={OUT} strokeWidth="2" />
        </>)}
        {melting && (<>
          <circle cx="48" cy="62" r="5" fill={OUT} /><circle cx="72" cy="62" r="5" fill={OUT} />
          <path d="M38 52 L54 58 M82 52 L66 58" stroke={OUT} strokeWidth="3" strokeLinecap="round" />
          <path d="M48 80 Q60 70 72 80" stroke={OUT} strokeWidth="3.5" fill="none" strokeLinecap="round" />
          <path d="M44 92 Q44 104 48 104 Q52 104 52 92 Z" fill={ARM} />
        </>)}
        {mood === 'smug' && (<>
          <path d="M40 58 H56 M64 58 H80" stroke={OUT} strokeWidth="3.5" strokeLinecap="round" />
          <circle cx="52" cy="60" r="3.5" fill={OUT} /><circle cx="76" cy="60" r="3.5" fill={OUT} />
          <path d="M50 76 Q64 82 74 70" stroke={OUT} strokeWidth="3.5" fill="none" strokeLinecap="round" />
        </>)}
        {mood === 'sleepy' && (<>
          <path d="M42 60 Q48 66 54 60 M66 60 Q72 66 78 60" stroke={OUT} strokeWidth="3.5" fill="none" strokeLinecap="round" />
          <ellipse cx="60" cy="78" rx="5" ry="4" fill={OUT} />
          <text x="88" y="30" fontSize="16" fontWeight="900" fill="#666779">z</text><text x="98" y="18" fontSize="12" fontWeight="900" fill="#A3A4B3">z</text>
        </>)}
      </g>
    </motion.svg>
  );
}
