// Secret-less nudge used by open tabs: runs one drain at most every few seconds. It takes no input and only processes jobs
// the module itself queued, so it cannot be abused to do anything the outbox would not do anyway.
import { foreignOrigin } from '@/lib/server/limits';
import { BridgeConfigError, drainOutbox } from '@/server/stdb-bridge';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const MIN_GAP_MS = 2500;
let lastRun = 0;

export async function POST(req: Request): Promise<Response> {
  if (foreignOrigin(req)) return Response.json({ error: 'forbidden' }, { status: 403 });
  const now = Date.now();
  if (now - lastRun < MIN_GAP_MS) return Response.json({ ran: false });
  lastRun = now;
  try {
    const report = await drainOutbox();
    return Response.json({ ran: true, ...report });
  } catch (e) {
    if (e instanceof BridgeConfigError) return Response.json({ ran: false, error: 'bridge_not_configured' }, { status: 503 });
    console.warn('[bridge] poke failed', e instanceof Error ? e.message : e);
    return Response.json({ ran: false, error: 'tick_failed' }, { status: 502 });
  }
}
