'use client';
import { useEffect, useState } from 'react';
import { enableNotifications, notificationPermission, notify } from '@/lib/notify';
import { playSfx } from '@/lib/sfx';
import { setPrefs, speak, usePrefs } from '@/lib/voice';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { useToast } from '../ui/Toast';

function Switch({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
      className="w-full flex items-center justify-between gap-3 text-left min-h-12 py-1">
      <span><span className="block font-extrabold">{label}</span><span className="block text-sm font-bold text-ink-soft">{hint}</span></span>
      <span className={`shrink-0 w-12 h-7 rounded-full p-0.5 transition-colors ${checked ? 'bg-leaf' : 'bg-surface-line'}`}>
        <span className={`block size-6 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : ''}`} />
      </span>
    </button>
  );
}

export function VoiceSettings() {
  const prefs = usePrefs();
  const { toast } = useToast();
  const [perm, setPerm] = useState<string>('default');
  useEffect(() => { setPerm(notificationPermission()); }, []);

  const toggleVoice = async (on: boolean) => {
    setPrefs({ voice: on });
    if (on) {
      const r = await speak("Voice is on. I'll be roasting you out loud.");
      if (r === 'failed') toast('Voice is not available right now.', 'error');
    }
  };
  const toggleNotify = async (on: boolean) => {
    if (!on) return setPrefs({ notify: false });
    const p = await enableNotifications();
    setPerm(p);
    if (p === 'granted') { setPrefs({ notify: true }); void notify('Notifications on', 'Flakey will nudge you before deadlines.', 'welcome'); }
    else toast(p === 'unsupported' ? 'This browser has no notifications.' : 'Notifications are blocked. Allow them in your browser settings.', 'error');
  };

  return (
    <Card className="space-y-2" aria-label="Voice and notifications">
      <h2 className="font-display font-black text-lg">Voice and notifications</h2>
      <Switch checked={prefs.voice} onChange={toggleVoice} label="Flakey speaks" hint="Squad Bot roasts and hype are read out loud." />
      <Switch checked={prefs.sfx} onChange={(v) => { setPrefs({ sfx: v }); if (v) playSfx('success'); }} label="Sound effects" hint="Trombone when you flake, fanfare when you nail it, ka-ching for money." />
      <Switch checked={prefs.notify && perm === 'granted'} onChange={toggleNotify} label="Notifications" hint="Deadline reminders and squad activity while the app is open." />
      <div className="grid grid-cols-2 gap-3 pt-1">
        <Button variant="secondary" className="min-h-11 py-2" onClick={() => speak('Kevin flaked on the gym. The pool says thanks.')}>Test voice</Button>
        <Button variant="secondary" className="min-h-11 py-2" disabled={perm !== 'granted'} onClick={() => notify('Deadline soon', 'Gym closes in 25 minutes. Flakey is sweating.', 'test')}>Test alert</Button>
      </div>
    </Card>
  );
}
