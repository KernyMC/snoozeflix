'use client';
import { Loader2, Square, Volume2 } from 'lucide-react';
import { useState } from 'react';
import { sanitizeSpeech } from '@/lib/speech';
import { speak, stopSpeaking, usePlayingText } from '@/lib/voice';
import { useToast } from '../ui/Toast';

/** Small round "listen" button. Works as the user gesture that unlocks audio. */
export function SpeakButton({ text, className = '' }: { text: string; className?: string }) {
  const { toast } = useToast();
  const playing = usePlayingText();
  const [loading, setLoading] = useState(false);
  const clean = sanitizeSpeech(text);
  if (!clean) return null;
  const active = playing === clean;

  const click = async () => {
    if (active) return stopSpeaking();
    setLoading(true);
    const p = speak(text);
    const timer = setTimeout(() => setLoading(false), 400); // spinner only while fetching
    const r = await p;
    clearTimeout(timer);
    setLoading(false);
    if (r === 'failed') toast('Flakey lost their voice. Try again.', 'error');
    if (r === 'blocked') toast('Your browser blocked the sound. Tap again.', 'error');
  };

  return (
    <button type="button" onClick={click} aria-label={active ? 'Stop speaking' : 'Listen'} aria-pressed={active}
      className={`size-9 shrink-0 rounded-full grid place-items-center bg-white/70 text-grape-dark active:scale-95 ${className}`}>
      {loading ? <Loader2 size={18} className="animate-spin" /> : active ? <Square size={16} fill="currentColor" /> : <Volume2 size={18} strokeWidth={2.5} />}
    </button>
  );
}
