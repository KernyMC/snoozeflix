'use client';
import { motion } from 'framer-motion';
import { Flakey, type Mood } from './ui/Flakey';
import { Button } from './ui/Button';

/** Bottom sheet like a lesson-answer banner: green when you nailed it, red with a roast when not. */
export function ResultSheet({ tone, title, line, mood, primary, secondary, extra }: {
  tone: 'success' | 'fail'; title: string; line?: React.ReactNode; mood: Mood;
  primary: { label: string; onClick?: () => void; href?: string };
  secondary?: { label: string; onClick?: () => void; href?: string };
  extra?: React.ReactNode;
}) {
  const ok = tone === 'success';
  return (
    <motion.div
      role="alert" initial={{ y: '100%' }} animate={{ y: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className={`fixed inset-x-0 bottom-0 z-40 rounded-t-3xl px-5 pt-5 pb-8 ${ok ? 'bg-leaf-light' : 'bg-ember-light'}`}
    >
      <div className="mx-auto max-w-md">
        <div className="flex items-center gap-3 mb-4">
          <Flakey mood={mood} size={72} />
          <div className="min-w-0">
            <h2 className={`font-display font-black text-3xl ${ok ? 'text-leaf-dark' : 'text-ember-dark'}`}>{title}</h2>
            {line && <p className={`font-bold ${ok ? 'text-leaf-dark' : 'text-ember-dark'}`}>{line}</p>}
          </div>
        </div>
        {extra}
        <div className="space-y-3">
          <Button variant={ok ? 'primary' : 'danger'} onClick={primary.onClick} href={primary.href}>{primary.label}</Button>
          {secondary && <Button variant="ghost" onClick={secondary.onClick} href={secondary.href} className={ok ? 'text-leaf-dark' : 'text-ember-dark'}>{secondary.label}</Button>}
        </div>
      </div>
    </motion.div>
  );
}
