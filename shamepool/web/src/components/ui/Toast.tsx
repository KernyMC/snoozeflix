'use client';
import { AnimatePresence, motion } from 'framer-motion';
import { createContext, useCallback, useContext, useMemo, useState } from 'react';

type Tone = 'info' | 'success' | 'error';
interface T { id: number; text: string; tone: Tone }
const Ctx = createContext<{ toast: (text: string, tone?: Tone) => void }>({ toast: () => {} });
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<T[]>([]);
  const toast = useCallback((text: string, tone: Tone = 'info') => {
    const id = Date.now() + Math.random();
    setItems((l) => [...l.slice(-2), { id, text, tone }]);
    setTimeout(() => setItems((l) => l.filter((x) => x.id !== id)), 3500);
  }, []);
  const value = useMemo(() => ({ toast }), [toast]);
  const color = { info: 'bg-ink text-white', success: 'bg-leaf text-white', error: 'bg-ember text-white' };
  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="fixed top-3 inset-x-0 z-[70] flex flex-col items-center gap-2 px-4 pointer-events-none" aria-live="polite">
        <AnimatePresence>
          {items.map((t) => (
            <motion.div
              key={t.id} initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
              className={`${color[t.tone]} rounded-2xl px-4 py-3 font-extrabold shadow-chunky [--edge:rgba(0,0,0,.25)] max-w-sm text-center`}
            >
              {t.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}
