'use client';
export function StayTimerRing({ remainingS, totalS, size = 220 }: { remainingS: number; totalS: number; size?: number }) {
  const stroke = 14;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const done = totalS > 0 ? 1 - remainingS / totalS : 1;
  const mm = Math.floor(remainingS / 60);
  const ss = Math.floor(remainingS % 60);
  return (
    <div className="relative" style={{ width: size, height: size }} role="timer" aria-label={`${mm} minutes ${ss} seconds left`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E5E2D9" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#75BFBC" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0, Math.min(1, done)))} style={{ transition: 'stroke-dashoffset 1s linear' }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <div className="text-center">
          <div className="font-display font-black text-5xl tabular">{String(mm).padStart(2, '0')}:{String(ss).padStart(2, '0')}</div>
          <div className="text-xs font-extrabold uppercase tracking-wide text-ink-faint">{remainingS > 0 ? "don't leave!" : 'time is up!'}</div>
        </div>
      </div>
    </div>
  );
}
