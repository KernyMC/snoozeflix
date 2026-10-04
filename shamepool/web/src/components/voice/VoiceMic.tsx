'use client';
import { Loader2, Mic, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { micSupported, type Recording, startRecording, transcribe } from '@/lib/mic';
import { stopSpeaking } from '@/lib/voice';
import { useToast } from '../ui/Toast';

type Phase = 'idle' | 'listening' | 'transcribing';
const MAX_MS = 10_000;

const FRIENDLY: Record<string, string> = {
  no_speech: "I didn't catch that. Try again a bit louder.",
  rate_limited: 'Too many voice messages. Wait a minute.',
  unavailable: 'Voice is not available right now.',
  failed: 'Could not understand that. Try again.',
};

/** Tap to talk, tap again to send. Shows a pulsing ring while listening. */
export function VoiceMic({ onTranscript, disabled }: { onTranscript: (text: string) => void | Promise<void>; disabled?: boolean }) {
  const { toast } = useToast();
  const [phase, setPhase] = useState<Phase>('idle');
  const [secs, setSecs] = useState(0);
  const [supported, setSupported] = useState(false);
  const rec = useRef<Recording | null>(null);

  useEffect(() => { setSupported(micSupported()); }, []);
  useEffect(() => () => rec.current?.cancel(), []);
  useEffect(() => {
    if (phase !== 'listening') return;
    setSecs(0);
    const id = window.setInterval(() => setSecs((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [phase]);

  if (!supported) return null;

  const begin = async () => {
    stopSpeaking(); // don't record Flakey talking
    try {
      const r = await startRecording(MAX_MS);
      rec.current = r;
      setPhase('listening');
      const blob = await r.done.catch(() => null);
      rec.current = null;
      if (!blob) return setPhase('idle');
      setPhase('transcribing');
      const res = await transcribe(blob);
      setPhase('idle');
      if (!res.ok) return toast(FRIENDLY[res.error], 'error');
      await onTranscript(res.text);
    } catch (e) {
      setPhase('idle');
      const name = (e as DOMException)?.name;
      toast(name === 'NotAllowedError' || name === 'SecurityError'
        ? 'Microphone is blocked. Allow it in your browser settings (it needs https).'
        : name === 'NotFoundError' ? 'No microphone found.' : 'Could not start the microphone.', 'error');
    }
  };

  const click = () => {
    if (phase === 'idle') void begin();
    else if (phase === 'listening') rec.current?.stop();
  };

  return (
    <button type="button" onClick={click} disabled={disabled || phase === 'transcribing'} aria-pressed={phase === 'listening'}
      aria-label={phase === 'listening' ? 'Stop and send' : 'Talk to Flakey'}
      className={`relative shrink-0 size-12 rounded-2xl grid place-items-center text-white shadow-chunky active:translate-y-1 active:shadow-none disabled:opacity-60 ${
        phase === 'listening' ? 'bg-ember [--edge:var(--color-ember-dark)]' : 'bg-primary [--edge:var(--color-primary-dark)]'}`}>
      {phase === 'listening' && <span className="absolute inset-0 rounded-2xl bg-ember/40 animate-ping" aria-hidden />}
      <span className="relative">
        {phase === 'transcribing' ? <Loader2 className="animate-spin" size={22} /> : phase === 'listening' ? <Square size={18} fill="currentColor" /> : <Mic size={22} strokeWidth={2.5} />}
      </span>
      {phase === 'listening' && <span className="absolute -top-2 -right-2 rounded-full bg-white text-ember-dark text-[11px] font-black px-1.5 tabular" aria-hidden>{Math.max(0, MAX_MS / 1000 - secs)}s</span>}
    </button>
  );
}
