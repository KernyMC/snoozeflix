// Private bot thread (askBot / confirmBotAction). Thread rows are only visible to their owner through the my_bot_messages view.
import { formatCents, LIMITS } from './shared/logic';
import type { BotReply, PendingAction } from './shared/types';
import { botAnswer } from './bot';
import { type Env, err, meOf, ok, uid } from './core';
import { updateGoalPenalty } from './game';

const ACTION_TTL_MS = 5 * 60_000;

function addThread(env: Env, userId: string, fromBot: boolean, text: string, pending?: PendingAction): void {
  env.ctx.db.botMessage.insert({
    id: uid(env, 'm'), userId, fromBot, text, actionJson: pending ? JSON.stringify(pending) : '', createdAt: env.now,
  });
}

export function askBot(env: Env, text: string) {
  const c = env.ctx;
  const me = meOf(env);
  if (!me) return err('no_user');
  const t = text.trim();
  if (t.length < 1 || t.length > LIMITS.messageMax) return err('invalid_message');
  addThread(env, me.id, false, t);
  const a = botAnswer(env, me.id, t);
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
