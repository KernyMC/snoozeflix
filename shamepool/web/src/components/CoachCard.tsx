'use client';
import { Sparkles } from 'lucide-react';
import { useState } from 'react';
import { formatCents, useMe, useMyGoals } from '@/data';
import { coachAi } from '@/lib/ai/client';
import type { CoachPlan } from '@/lib/ai/types';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { inputCls } from './ui/Field';
import { useToast } from './ui/Toast';
import { VoiceMic } from './voice/VoiceMic';

/** "Tell Flakey what you want": one sentence (typed or spoken) fills in the whole commitment form. */
export function CoachCard({ onPlan }: { onPlan: (plan: CoachPlan) => void }) {
  const { toast } = useToast();
  const me = useMe();
  const goals = useMyGoals();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [tip, setTip] = useState('');

  const run = async (said: string) => {
    const t = said.trim();
    if (t.length < 3 || busy) return;
    setBusy(true);
    setTip('');
    const plan = await coachAi(t, { balance: me ? formatCents(me.balanceCents) : undefined, existingGoals: goals.map((g) => g.title) });
    setBusy(false);
    if (!plan) return toast('Flakey could not plan that right now. Fill the form by hand.', 'error');
    onPlan(plan);
    setTip(plan.tip);
    toast('Filled in. Check it and adjust.', 'success');
  };

  return (
    <Card tone="grape" className="space-y-3" aria-label="Goal coach">
      <p className="font-display font-black text-lg flex items-center gap-2 text-grape-dark"><Sparkles size={20} strokeWidth={2.5} /> Not sure how? Tell Flakey</p>
      <div className="flex gap-2">
        <VoiceMic disabled={busy} onTranscript={(said) => { setText(said); return run(said); }} />
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={300} aria-label="Describe your goal"
          placeholder="I want to hit the gym after class" className={inputCls}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void run(text); } }} />
      </div>
      <Button variant="bot" onClick={() => run(text)} loading={busy} disabled={text.trim().length < 3}>Fill it in for me</Button>
      {tip && <p role="status" className="text-sm font-extrabold text-grape-dark">{tip}</p>}
    </Card>
  );
}
