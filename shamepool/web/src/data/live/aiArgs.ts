// Pure converters from the app's AI types to the flat arguments of the Spacetime procedures finish_checkin_ai / ask_bot_ai.
import type { AiBotInput, PhotoVerdict } from '../types';

const NO_VERDICT = { verified: false, confidence: 0, reason: '', roast: '' };

/** undefined = no AI attempted ('none'), null = AI route failed ('unavailable'), otherwise the verdict. */
export function aiVerdictArgs(ai: PhotoVerdict | null | undefined) {
  if (ai === undefined) return { aiMode: 'none', verdict: NO_VERDICT };
  if (ai === null) return { aiMode: 'unavailable', verdict: NO_VERDICT };
  return {
    aiMode: 'verdict',
    verdict: {
      verified: !!ai.verified, confidence: Number.isFinite(ai.confidence) ? ai.confidence : 0.7,
      reason: String(ai.reason ?? '').slice(0, 120), roast: ai.roast ? String(ai.roast).slice(0, 140) : '',
    },
  };
}

export function aiBotArgs(ai: AiBotInput) {
  const a = ai.action;
  return {
    aiText: String(ai.text ?? '').slice(0, 400), hasAction: !!a, goalTitle: a ? String(a.goalTitle ?? '').slice(0, 60) : '',
    dollars: a && Number.isFinite(Number(a.dollars)) ? Number(a.dollars) : 0,
  };
}
