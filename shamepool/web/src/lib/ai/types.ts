/** Shapes shared by the AI routes and the client. Plain JSON, no secrets. */
export interface AiAction { goalTitle: string; dollars: number }
export interface AiChatReply { text: string; action: AiAction | null }

export interface AiVerdict { verified: boolean; confidence: number; reason: string; roast: string | null }

export const COACH_ICONS = ['goal-gym', 'goal-book', 'goal-run', 'goal-yoga', 'goal-guitar', 'goal-target'] as const;
export type CoachIcon = (typeof COACH_ICONS)[number];

export interface CoachPlan {
  title: string; icon: CoachIcon; days: number[]; deadlineMinutes: number; minStayMinutes: number;
  basePenaltyCents: number; radiusM: number; tip: string;
}
