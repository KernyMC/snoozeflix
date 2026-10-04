'use client';
import { motion } from 'framer-motion';
import { Ellipsis, Send } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { askBot, confirmBotAction, useBotThread, useNow } from '@/data';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/ui/Button';
import { inputCls } from '@/components/ui/Field';
import { Flakey } from '@/components/ui/Flakey';
import { IconText } from '@/components/ui/IconText';
import { errorText } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';

const CHIPS = ["Who's flaking?", 'Pool status', 'Raise my penalty to $10', 'My streak'];

function Chat() {
  const thread = useBotThread();
  const now = useNow(1000);
  const { toast } = useToast();
  const [text, setText] = useState('');
  const [typing, setTyping] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [thread.length, typing]);

  const send = async (t: string) => {
    const msg = t.trim();
    if (!msg || typing) return;
    setText('');
    setTyping(true);
    const r = await askBot(msg);
    setTyping(false);
    if (!r.ok) toast(errorText(r.error), 'error');
  };
  const confirm = async (id: string) => {
    setTyping(true);
    const r = await confirmBotAction(id);
    setTyping(false);
    if (!r.ok) toast(errorText(r.error), 'error'); else toast('Done', 'success');
  };

  return (
    <div className="flex flex-col min-h-[calc(100dvh-14rem)]">
      <div className="flex-1 space-y-3 pb-3" aria-live="polite" aria-label="Squad Bot conversation">
        <div className="flex gap-2 items-end">
          <Flakey mood="smug" size={44} />
          <div className="max-w-[80%] rounded-2xl rounded-bl-md bg-grape-light px-4 py-3 font-bold text-grape-dark">
            I&apos;m Squad Bot. Ask me who&apos;s flaking, how close the pool is, or change your penalty. I judge a little.
          </div>
        </div>
        {thread.map((m) => m.from === 'me' ? (
          <motion.div key={m.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex justify-end">
            <div className="max-w-[80%] rounded-2xl rounded-br-md bg-sky text-white px-4 py-3 font-bold break-words">{m.text}</div>
          </motion.div>
        ) : (
          <motion.div key={m.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex gap-2 items-end">
            <Flakey mood="smug" size={44} />
            <div className="max-w-[80%] space-y-2">
              <div className="rounded-2xl rounded-bl-md bg-grape-light px-4 py-3 font-bold text-grape-dark break-words"><IconText>{m.text}</IconText></div>
              {m.pendingAction && !dismissed.has(m.pendingAction.id) && (
                <div className="rounded-2xl border-2 border-grape bg-white p-3 space-y-2" role="group" aria-label="Confirm action">
                  <p className="text-xs font-extrabold uppercase tracking-wide text-grape-dark">Confirm action</p>
                  <p className="font-extrabold"><IconText>{m.pendingAction.label}</IconText></p>
                  {now > m.pendingAction.expiresAt ? <p className="text-sm font-bold text-ink-faint">Expired. Ask again.</p> : (
                    <div className="grid grid-cols-2 gap-2">
                      <Button variant="bot" onClick={() => confirm(m.pendingAction!.id)} className="min-h-11 py-2">Confirm</Button>
                      <Button variant="secondary" onClick={() => setDismissed(new Set(dismissed).add(m.pendingAction!.id))} className="min-h-11 py-2">Cancel</Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        ))}
        {typing && (
          <div className="flex gap-2 items-end" role="status" aria-label="Squad Bot is typing">
            <Flakey mood="smug" size={44} />
            <div className="rounded-2xl rounded-bl-md bg-grape-light px-4 py-2.5 text-grape-dark animate-pulse"><Ellipsis aria-hidden size={28} strokeWidth={3} fill="currentColor" /></div>
          </div>
        )}
        <div ref={end} />
      </div>

      <div className="sticky bottom-20 bg-white pt-2 space-y-2">
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1" aria-label="Suggestions">
          {CHIPS.map((c) => (
            <button key={c} onClick={() => send(c)} disabled={typing}
              className="shrink-0 rounded-full border-2 border-grape/40 bg-grape-light px-3.5 py-2 min-h-11 font-extrabold text-grape-dark text-sm active:translate-y-px disabled:opacity-50">{c}</button>
          ))}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); void send(text); }} className="flex gap-2">
          <input value={text} onChange={(e) => setText(e.target.value)} maxLength={280} aria-label="Message Squad Bot" placeholder="Ask Squad Bot…" className={inputCls} />
          <Button variant="bot" full={false} type="submit" disabled={!text.trim() || typing} aria-label="Send" className="px-4"><Send size={20} strokeWidth={3} /></Button>
        </form>
      </div>
    </div>
  );
}

export default function BotPage() {
  return <AppShell><h1 className="font-display font-black text-3xl mb-3">Squad Bot</h1><Chat /></AppShell>;
}
