'use client';
import { useState } from 'react';
import {
  cancelCashout, charityById, formatCents, proposeCashout, setPoolGoal, useCharityStatus, useMe, useNow, useOpenCashout, useSquad, useSquadMembers, voteCashout,
} from '@/data';
import { fireConfetti } from './effects';
import { playSfx } from '@/lib/sfx';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { dollarsToCents, Field } from './ui/Field';
import { Flakey } from './ui/Flakey';
import { Icon } from './ui/Icon';
import { errorText } from './ui/States';
import { useToast } from './ui/Toast';

/** Shows when pool >= goal (propose) or while a proposal is open (vote), or after paying (new goal). */
export function CashoutBanner() {
  const squad = useSquad();
  const me = useMe();
  const open = useOpenCashout();
  const members = useSquadMembers();
  const charity = useCharityStatus();
  const now = useNow(1000);
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [merchant, setMerchant] = useState('Pizza House');
  const [newName, setNewName] = useState('');
  const [newAmt, setNewAmt] = useState('60');
  if (!squad || !me) return null;

  const act = async (fn: () => Promise<{ ok: boolean; error?: string }>, success?: string) => {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (!r.ok) toast(errorText(r.error ?? 'unknown'), 'error');
    else if (success) { toast(success, 'success'); fireConfetti(true); playSfx('cash'); }
  };

  if (open) {
    const mine = open.votes[me.id];
    const yes = Object.values(open.votes).filter(Boolean).length;
    const need = Math.floor(members.length / 2) + 1;
    return (
      <Card tone="sun" className="space-y-3" aria-label="Cash-out vote">
        <div className="flex items-center gap-3">
          <Flakey mood="cheer" size={56} />
          <div>
            <h2 className="font-display font-black text-xl">{open.kind === 'donate' ? `Donate ${formatCents(open.amountCents)} to ${open.merchantName}?` : `Spend ${formatCents(open.amountCents)} at ${open.merchantName}?`}</h2>
            <p className="text-sm font-bold text-ink-soft">{yes} yes · need {need} of {members.length}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Button variant={mine === true ? 'primary' : 'secondary'} loading={busy} onClick={() => act(() => voteCashout(open.id, true), 'Voted yes')}><Icon name="thumbs-up" /> Yes</Button>
          <Button variant={mine === false ? 'danger' : 'secondary'} loading={busy} onClick={() => act(() => voteCashout(open.id, false))}><Icon name="thumbs-down" /> No</Button>
        </div>
        {open.proposerUserId === me.id && <Button variant="ghost" onClick={() => act(() => cancelCashout(open.id))}>Cancel proposal</Button>}
      </Card>
    );
  }

  if (squad.poolBalanceCents >= squad.poolGoalCents) {
    return (
      <Card tone="leaf" className="space-y-3" aria-label="Cash-out ready">
        <div className="flex items-center gap-3">
          <Flakey mood="cheer" size={64} />
          <div>
            <h2 className="font-display font-black text-xl text-leaf-dark">Pool is full! <Icon name="party" /></h2>
            <p className="text-sm font-bold text-ink-soft">Time to spend {formatCents(squad.poolGoalCents)} on {squad.poolGoalName}.</p>
            {charity?.deadlineAt && <p className="text-xs font-extrabold text-ember-dark mt-1">Spend it within {leftText(charity.deadlineAt - now)} or it goes to {charityById(charity.charityId).name}.</p>}
          </div>
        </div>
        <Field label="Where?" value={merchant} onChange={(e) => setMerchant(e.target.value)} maxLength={30} />
        <Button loading={busy} onClick={() => act(() => proposeCashout(merchant))}>Propose cash-out</Button>
      </Card>
    );
  }

  // Leftover after a paid cash-out is covered by the pool goal; offer a new goal when pool is empty-ish and last proposal paid.
  return null;
}

/** After spending: let the squad choose the next pool goal. */
export function NewPoolGoal() {
  const squad = useSquad();
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [amt, setAmt] = useState('60');
  const [busy, setBusy] = useState(false);
  if (!squad) return null;
  const save = async () => {
    const cents = dollarsToCents(amt);
    setBusy(true);
    const r = await setPoolGoal(name || squad.poolGoalName, cents);
    setBusy(false);
    toast(r.ok ? 'New pool goal set' : errorText(r.error), r.ok ? 'success' : 'error');
  };
  return (
    <Card className="space-y-3">
      <h2 className="font-display font-black text-lg">Change pool goal</h2>
      <Field label="Goal" value={name} placeholder={squad.poolGoalName} onChange={(e) => setName(e.target.value)} maxLength={30} />
      <Field label="Amount ($)" inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} />
      <Button variant="pool" loading={busy} onClick={save}>Save goal</Button>
    </Card>
  );
}

function leftText(ms: number): string {
  if (ms <= 0) return 'a moment';
  const s = Math.ceil(ms / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${String(s % 60).padStart(2, '0')}s` : `${s}s`;
}
