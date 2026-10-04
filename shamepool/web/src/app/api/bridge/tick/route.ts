// Drains the Spacetime outbox into Nessie. Protected by BRIDGE_TICK_SECRET (header `x-bridge-secret` or `Authorization: Bearer`).
// Call it from a cron / a loop:  curl -X POST -H "x-bridge-secret: $BRIDGE_TICK_SECRET" http://localhost:3101/api/bridge/tick
import { timingSafeEqual } from 'node:crypto';
import { BridgeConfigError, drainOutbox } from '@/server/stdb-bridge';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

function authorized(req: Request): boolean {
  const secret = process.env.BRIDGE_TICK_SECRET;
  if (!secret) return false;
  const given = req.headers.get('x-bridge-secret') ?? req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handle(req: Request): Promise<Response> {
  if (!authorized(req)) return Response.json({ error: 'unauthorized' }, { status: 401 });
  try {
    return Response.json({ ok: true, ...(await drainOutbox()) });
  } catch (e) {
    if (e instanceof BridgeConfigError) return Response.json({ error: 'bridge_not_configured' }, { status: 503 });
    console.warn('[bridge] tick failed', e instanceof Error ? e.message : e);
    return Response.json({ error: 'tick_failed' }, { status: 502 });
  }
}

export const GET = handle;
export const POST = handle;
