'use client';
import { motion } from 'framer-motion';

export function ProgressBar({ value, tone = 'leaf', label }: { value: number; tone?: 'leaf' | 'sun' | 'sky' | 'ember'; label?: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const fill = { leaf: 'bg-sky', sun: 'bg-sun', sky: 'bg-sky', ember: 'bg-ember' }[tone];
  return (
    <div className="h-4 w-full rounded-full bg-surface-line overflow-hidden" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <motion.div
        className={`relative h-full rounded-full ${fill} after:absolute after:left-2 after:right-2 after:top-[3px] after:h-[4px] after:rounded-full after:bg-white/30`}
        initial={false}
        animate={{ width: `${Math.max(pct, pct > 0 ? 6 : 0)}%` }}
        transition={{ type: 'spring', stiffness: 120, damping: 20 }}
      />
    </div>
  );
}
