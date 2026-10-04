// Private bot thread (askBot / confirmBotAction). Thread rows are only visible to their owner through the my_bot_messages view.
import { formatCents, LIMITS } from './shared/logic';
import type { AiBotInput, BotReply, PendingAction } from './shared/types';
import { botAnswer, type BotAnswer } from './bot';
import { type Env, err, meOf, ok, uid } from './core';
import { updateGoalPenalty } from './game';

const ACTION_TTL_MS = 5 * 60_000;

function addThread(env: Env, userId: string, fromBot: boolean, text: string, pending?: PendingAction): void {
  env.ctx.db.botMessage.insert({
    id: uid(env, 'm'), userId, fromBot, text, actionJson: pending ? JSON.stringify(pending) : '', createdAt: env.now,
  });
}

/**
 * Turns an answer written by the AI (server route /api/ai/chat) into a bot reply. The model never moves money: a
 * proposed penalty change is matched to one of the user's own active goals, range-checked, and only becomes a pending
 * action the user must confirm. Port of mock/engine.ts fromAi.
 */
function fromAi(env: Env, userId: string, ai: AiBotInput): BotAnswer {
  const text = String(ai.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 400) || 'Hmm, I got nothing. Try again?';
  if (!ai.action) return { text };
  const goals = [...env.ctx.db.goal.userId.filter(userId)].filter((g) => g.active);
  const want = String(ai.action.goalTitle ?? '').trim().toLowerCase();
  const goal = goals.find((g) => g.title.toLowerCase() === want)
    ?? goals.find((g) => want && (g.title.toLowerCase().includes(want) || want.includes(g.title.toLowerCase())));
  if (!goal) return { text: `${text} (I could not find that goal, so nothing will change.)` };
  const cents = Math.round(Number(ai.action.dollars) * 100);
  if (!Number.isInteger(cents) || cents < LIMITS.penaltyMin || cents > goal.maxPenaltyCents) {
    return { text: `The penalty on ${goal.title} has to be between $1 and ${formatCents(goal.maxPenaltyCents)}.` };
  }
  return { text, action: { label: `${goal.title}: ${formatCents(goal.basePenaltyCents)} \u2192 ${formatCents(cents)}`, args: { goalId: goal.id, baseCents: cents } } };
}

export function askBot(env: Env, text: string, ai?: AiBotInput) {
  const c = env.ctx;
  const me = meOf(env);
  if (!me) return err('no_user');
  const t = text.trim();
  if (t.length < 1 || t.length > LIMITS.messageMax) return err('invalid_message');
  addThread(env, me.id, false, t);
  const a = ai ? fromAi(env, me.id, ai) : botAnswer(env, me.id, t);
  let pendingAction: PendingAction | undefined;
  if (a.action) {
    pendingAction = { id: uid(env, 'act'), label: a.action.label, kind: 'update_goal_penalty', args: a.action.args, expiresAt: env.now + ACTION_TTL_MS };
    c.db.pendingAction.insert({ id: pendingAction.id, userId: me.id, label: pendingAction.label, argsJson: JSON.stringify(a.action.args), expiresAt: pendingAction.expiresAt });
  }
  addThread(env, me.id, true, a.text, pendingAction);
  return ok<BotReply>({ text: a.text, pendingAction });
}

export function confirmBotAction(env: Env, actionId: string) {
  const c = env.ctx;
  const me = meOf(env);
  if (!me) return err('no_user');
  const act = c.db.pendingAction.id.find(actionId);
  if (!act || act.userId !== me.id) return err('action_not_found');
  if (env.now > act.expiresAt) {
    c.db.pendingAction.id.delete(actionId);
    return err('action_expired');
  }
  const args = JSON.parse(act.argsJson) as { goalId: string; baseCents: number };
  const res = updateGoalPenalty(env, String(args.goalId), Number(args.baseCents));
  c.db.pendingAction.id.delete(actionId); // F9: second confirm -> action_not_found
  const text = res.ok ? `Done. "${res.data.title}" now costs ${formatCents(res.data.basePenaltyCents)} per flake. Brave.` : 'I could not do that one.';
  addThread(env, me.id, true, text);
  for (const m of [...c.db.botMessage.userId.filter(me.id)]) {
    if (!m.actionJson) continue;
    try { if ((JSON.parse(m.actionJson) as PendingAction).id === actionId) c.db.botMessage.id.update({ ...m, actionJson: '' }); } catch { /* ignore */ }
  }
  return res.ok ? ok<BotReply>({ text }) : res;
}
