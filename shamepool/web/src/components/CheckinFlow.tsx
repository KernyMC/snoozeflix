'use client';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  finishCheckin, formatDistance, getDemoFlags, pingCheckin, startCheckin, useGoal, useNow, type Goal, type Pos,
} from '@/data';
import { fireConfetti, vibrate } from './effects';
import { playSfx } from '@/lib/sfx';
import { verifyPhotoAi } from '@/lib/ai/client';
import { geoError } from './LocationPicker';
import { PhotoCapture } from './PhotoCapture';
import { ResultSheet } from './ResultSheet';
import { StayTimerRing } from './StayTimerRing';
import { Button } from './ui/Button';
import { Flakey, type Mood } from './ui/Flakey';
import { Icon } from './ui/Icon';
import { errorText } from './ui/States';
import { DEMO_ENABLED } from '@/lib/demo';

type Step = 'locating' | 'too_far' | 'geo_error' | 'blocked' | 'stay' | 'photo' | 'verifying' | 'success' | 'rejected' | 'failed';
const SEGMENTS = ['Locate', 'Stay', 'Photo', 'Verify'];
const segIndex = (s: Step) => ({ locating: 0, too_far: 0, geo_error: 0, blocked: 0, stay: 1, photo: 2, verifying: 3, success: 3, rejected: 3, failed: 1 }[s]);
const LOADING_LINES = ['Asking the AI nicely…', 'Squinting at your photo…', 'Checking for couches…', 'Consulting Flakey…', 'Counting your abs (kidding)…'];
const DEMO = DEMO_ENABLED;

function getPos(): Promise<Pos> {
  const fake = DEMO ? getDemoFlags().fakeLocation : null;
  if (fake) return Promise.resolve(fake);
  return new Promise((res, rej) => {
    if (!navigator.geolocation) return rej({ code: 2 });
    navigator.geolocation.getCurrentPosition(
      (p) => res({ lat: p.coords.latitude, lng: p.coords.longitude, accuracyM: p.coords.accuracy }),
      rej, { enableHighAccuracy: true, timeout: 10_000, maximumAge: 5_000 },
    );
  });
}

export function CheckinFlow({ goal }: { goal: Goal }) {
  const router = useRouter();
  const live = useGoal(goal.id) ?? goal;
  const [step, setStep] = useState<Step>('locating');
  const [msg, setMsg] = useState('');
  const [distanceM, setDistanceM] = useState(0);
  const [checkinId, setCheckinId] = useState('');
  const [startedAt, setStartedAt] = useState(0);
  const [photo, setPhoto] = useState<{ b64: string; url: string } | null>(null);
  const [roast, setRoast] = useState('');
  const [reason, setReason] = useState('');
  const [attemptsLeft, setAttemptsLeft] = useState(3);
  const [lineIdx, setLineIdx] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const now = useNow(1000);
  const exit = () => router.push(`/goals/${goal.id}`);

  const begin = useCallback(async () => {
    setStep('locating');
    let pos: Pos;
    try { pos = await getPos(); } catch (e) { setMsg(geoError(e as GeolocationPositionError)); setStep('geo_error'); return; }
    const r = await startCheckin(goal.id, pos);
    if (r.ok) { setCheckinId(r.data.id); setStartedAt(r.data.startedAt); setStep('stay'); return; }
    if (r.error === 'too_far') { setDistanceM(Number(r.meta?.distanceM ?? 0)); setStep('too_far'); return; }
    if (r.error === 'too_many_attempts') { setMsg(errorText(r.error)); setStep('failed'); return; }
    setMsg(errorText(r.error));
    setStep('blocked');
  }, [goal.id]);

  const started = useRef(false);
  useEffect(() => { if (!started.current) { started.current = true; void begin(); } }, [begin]);

  // stay: ping every 30 s (edge C10)
  useEffect(() => {
    if (step !== 'stay' || !checkinId) return;
    const id = window.setInterval(async () => {
      let pos: Pos;
      try { pos = await getPos(); } catch { return; } // transient GPS failure: don't punish
      const r = await pingCheckin(checkinId, pos);
      if (!r.ok && r.error === 'left_area') { vibrate([100, 50, 100]); setMsg('You left the area. The check-in failed.'); setStep('failed'); }
    }, 30_000);
    return () => window.clearInterval(id);
  }, [step, checkinId]);

  // verifying: rotate silly lines
  useEffect(() => {
    if (step !== 'verifying') return;
    const id = window.setInterval(() => setLineIdx((i) => (i + 1) % LOADING_LINES.length), 1400);
    return () => window.clearInterval(id);
  }, [step]);

  const totalS = goal.minStayMinutes * 60;
  const remainingS = Math.max(0, Math.ceil(totalS - (now - startedAt) / 1000));

  const submit = async () => {
    if (!photo || submitting) return; // U4/C19: no double submit
    setSubmitting(true);
    setStep('verifying');
    const ai = await verifyPhotoAi(live.title, photo.b64); // null = AI unavailable: the check-in fails open, flagged
    const r = await finishCheckin(checkinId, photo.b64, ai);
    setSubmitting(false);
    if (r.ok) { fireConfetti(true); vibrate(60); playSfx('success'); setStep('success'); return; }
    const verdict = r.meta?.verdict as { roast?: string | null; reason?: string } | undefined;
    if (r.error === 'photo_rejected') { setRoast(verdict?.roast ?? 'Nice try.'); setReason(verdict?.reason ?? ''); setAttemptsLeft(Number(r.meta?.attemptsLeft ?? 0)); setPhoto(null); setStep('rejected'); return; }
    if (r.error === 'too_many_attempts') { setMsg(verdict?.roast ? `${verdict.roast} No more tries.` : errorText(r.error)); setStep('failed'); return; }
    if (r.error === 'too_early') { setStep('stay'); return; }
    setMsg(errorText(r.error));
    setStep('blocked');
  };

  const mood: Mood = step === 'success' ? 'cheer' : step === 'failed' || step === 'rejected' || step === 'blocked' ? 'melting' : step === 'too_far' || step === 'geo_error' ? 'worried' : 'happy';
  const idx = segIndex(step);

  return (
    <div className="mx-auto max-w-md min-h-dvh flex flex-col px-5 pt-4 pb-8">
      <div className="flex items-center gap-3">
        <button onClick={exit} aria-label="Close check-in" className="size-11 -ml-2 grid place-items-center text-ink-faint"><X size={28} strokeWidth={3} /></button>
        <div className="flex-1 flex gap-1.5" role="progressbar" aria-valuemin={0} aria-valuemax={4} aria-valuenow={idx + 1} aria-label={`Step ${idx + 1} of 4: ${SEGMENTS[idx]}`}>
          {SEGMENTS.map((s, i) => <span key={s} className={`h-3.5 flex-1 rounded-full ${i <= idx ? 'bg-sky' : 'bg-surface-line'}`} />)}
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 py-6">
        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-3 w-full">
            {step === 'locating' && (<>
              <Flakey mood="happy" size={120} />
              <h1 className="font-display font-black text-3xl">Finding you…</h1>
              <p className="text-ink-soft font-bold">Checking you are at {live.title}.</p>
            </>)}

            {step === 'too_far' && (<>
              <Flakey mood="worried" size={120} />
              <h1 className="font-display font-black text-3xl">Not there yet</h1>
              <p className="text-ink-soft font-extrabold text-lg">You&apos;re {formatDistance(distanceM)} from {live.title}. Nice try.</p>
              <p className="text-ink-faint font-bold">Get within {live.radiusM} m.</p>
            </>)}

            {step === 'geo_error' && (<>
              <Flakey mood="worried" size={120} />
              <h1 className="font-display font-black text-3xl">We can&apos;t see you</h1>
              <p className="text-ink-soft font-bold max-w-xs">{msg}</p>
              {DEMO && <p className="text-xs font-bold text-grape-dark max-w-xs">Demo tip: open <Icon name="wrench" /> and turn on &quot;Pretend I&apos;m there&quot;.</p>}
            </>)}

            {step === 'blocked' && (<>
              <Flakey mood="melting" size={120} />
              <h1 className="font-display font-black text-3xl">Can&apos;t check in</h1>
              <p className="text-ink-soft font-bold max-w-xs">{msg}</p>
            </>)}

            {step === 'stay' && (<>
              <h1 className="font-display font-black text-3xl">Stay right there</h1>
              <p className="text-ink-soft font-bold">We re-check your location every 30 s.</p>
              <div className="relative my-2">
                <StayTimerRing remainingS={remainingS} totalS={totalS} />
                <div className="absolute -right-3 -bottom-2"><Flakey mood={remainingS === 0 ? 'cheer' : 'happy'} size={64} /></div>
              </div>
            </>)}

            {step === 'photo' && (<>
              <h1 className="font-display font-black text-3xl">Prove it <Icon name="camera" /></h1>
              <p className="text-ink-soft font-bold max-w-xs">Take a photo of where you are. The AI will judge it.</p>
              {photo ? <img src={photo.url} alt="Your photo" className="w-60 h-60 object-cover rounded-3xl border-2 border-surface-line" /> : <Flakey mood="happy" size={110} />}
            </>)}

            {step === 'verifying' && (<>
              <Flakey mood="smug" size={120} />
              <h1 className="font-display font-black text-3xl">Verifying…</h1>
              <p className="text-ink-soft font-extrabold min-h-6" aria-live="polite">{LOADING_LINES[lineIdx]}</p>
            </>)}

            {step === 'success' && (<>
              <motion.div initial={{ scale: 0.6 }} animate={{ scale: [0.6, 1.1, 1] }} transition={{ duration: 0.45, ease: 'easeOut' }}><Flakey mood="cheer" size={150} /></motion.div>
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: -10 }} className="font-display font-black text-4xl text-flame">+1 <Icon name="fire" /></motion.div>
            </>)}

            {step === 'rejected' && <Flakey mood="smug" size={120} />}

            {step === 'failed' && (<>
              <Flakey mood="melting" size={120} />
              <h1 className="font-display font-black text-3xl">Check-in failed</h1>
              <p className="text-ink-soft font-bold max-w-xs">{msg}</p>
            </>)}
          </motion.div>
        </AnimatePresence>
      </div>

      {step === 'too_far' && <div className="space-y-3"><Button onClick={begin}>Check again</Button><Button variant="ghost" onClick={exit}>Back</Button></div>}
      {step === 'geo_error' && <div className="space-y-3"><Button onClick={begin}>Try again</Button><Button variant="ghost" onClick={exit}>Back</Button></div>}
      {step === 'blocked' && <Button onClick={exit}>Back to goal</Button>}
      {step === 'failed' && <div className="space-y-3"><Button onClick={begin}>Try again</Button><Button variant="ghost" onClick={exit}>Back</Button></div>}
      {step === 'stay' && <Button disabled={remainingS > 0} onClick={() => setStep('photo')}>{remainingS > 0 ? 'Keep waiting…' : 'Continue'}</Button>}
      {step === 'photo' && (photo
        ? <div className="space-y-3"><Button onClick={submit} loading={submitting}>Submit</Button><Button variant="secondary" onClick={() => setPhoto(null)}>Retake</Button></div>
        : <PhotoCapture onPhoto={(b64, url) => setPhoto({ b64, url })} />)}

      {step === 'success' && (
        <ResultSheet tone="success" mood="cheer" title="Nailed it!" line={<>Promise kept. Streak: {live.streak} <Icon name="fire" /></>}
          primary={{ label: 'Continue', onClick: exit }} secondary={{ label: 'See the squad', href: '/squad' }} />
      )}
      {step === 'rejected' && (
        <ResultSheet tone="fail" mood="smug" title="Not quite" line={roast}
          extra={<p className="text-sm font-bold text-ember-dark mb-3">{reason && `${reason}. `}{attemptsLeft} {attemptsLeft === 1 ? 'try' : 'tries'} left.</p>}
          primary={{ label: 'Try again', onClick: () => setStep('photo') }} secondary={{ label: 'Back', onClick: exit }} />
      )}
    </div>
  );
}
