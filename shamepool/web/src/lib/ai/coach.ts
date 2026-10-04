import { COACH_ICONS, type CoachIcon, type CoachPlan } from './types';

export const COACH_PROMPT = `You are the commitment coach of ShamePool. Turn the user's vague intention into a realistic, verifiable weekly commitment.
Reply ONLY with JSON: {"title": string (max 30 chars), "icon": one of ${COACH_ICONS.join(' | ')}, "days": number[] (0=Sunday..6=Saturday), "deadline": "HH:MM" local 24h time by which they must be there, "minStayMinutes": number, "basePenaltyDollars": number, "radiusM": number, "tip": string (one friendly sentence, max 20 words)}.
Guidance: pick 2 to 5 days the user can really keep (fewer for beginners). Minimum stay: gym 45, library 60, run 20, yoga 30, music practice 20, other 30. Base penalty: 5 dollars by default; 8 to 10 if the user says they often flake; never above 40. Radius 100 to 200 meters. If the user names days or a time, respect them. Write the title and tip in English, even if the user writes in another language. DATA may include the user's current goals; do not duplicate them.`;

const hhmm = /^([01]?\d|2[0-3]):([0-5]\d)$/;

/** Validates and clamps the model output into something the form can safely use. */
export function normalizeCoach(raw: unknown): CoachPlan | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const title = typeof r.title === 'string' ? r.title.replace(/\s+/g, ' ').trim().slice(0, 40) : '';
  if (!title) return null;
  const days = Array.isArray(r.days)
    ? [...new Set(r.days.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort()
    : [];
  if (days.length === 0) return null;
  const m = typeof r.deadline === 'string' ? r.deadline.trim().match(hhmm) : null;
  const deadlineMinutes = m ? Number(m[1]) * 60 + Number(m[2]) : 18 * 60;
  const icon: CoachIcon = (COACH_ICONS as readonly string[]).includes(String(r.icon)) ? (r.icon as CoachIcon) : 'goal-target';
  const clamp = (v: unknown, lo: number, hi: number, d: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d;
  };
  return {
    title, icon, days, deadlineMinutes,
    minStayMinutes: Math.round(clamp(r.minStayMinutes, 1, 180, 30)),
    basePenaltyCents: Math.round(clamp(r.basePenaltyDollars, 1, 40, 5)) * 100,
    radiusM: Math.round(clamp(r.radiusM, 50, 1000, 150) / 10) * 10,
    tip: typeof r.tip === 'string' ? r.tip.replace(/\s+/g, ' ').trim().slice(0, 160) : '',
  };
}

export function parseJsonObject(raw: string | null | undefined): unknown {
  if (!raw) return null;
  const body = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try { return JSON.parse(body); } catch {
    const m = body.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try { return JSON.parse(m[0]); } catch { return null; }
  }
}
