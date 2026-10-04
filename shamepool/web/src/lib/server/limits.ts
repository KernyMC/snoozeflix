import { timingSafeEqual } from 'node:crypto';

/**
 * Abuse guards for the paid AI/voice routes (per server instance: good enough for a demo, not a substitute
 * for a shared limiter such as Vercel Firewall rate limiting).
 */
const perIp = new Map<string, number[]>();
const global = new Map<string, number[]>();

export function tooMany(bucket: string, ip: string, perMinute: number, globalPerHour: number, now = Date.now()): boolean {
  const ipKey = `${bucket}:${ip}`;
  const recent = (perIp.get(ipKey) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  perIp.set(ipKey, recent);

  const hour = (global.get(bucket) ?? []).filter((t) => now - t < 3_600_000);
  hour.push(now);
  global.set(bucket, hour);

  return recent.length > perMinute || hour.length > globalPerHour;
}

/** Client address as set by the platform first (Vercel overwrites these), then the generic proxy header. */
export const clientIp = (req: Request): string =>
  req.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim()
  || req.headers.get('x-real-ip')?.trim()
  || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  || 'local';

function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Who may call the paid routes: our own pages (browsers always send a matching Origin, or Sec-Fetch-Site: same-origin
 * on POST) or a trusted server-side client that presents AGENT_API_KEY (the iMessage agent). A bare curl is refused.
 */
export function allowedCaller(req: Request): boolean {
  const key = process.env.AGENT_API_KEY?.trim();
  const given = req.headers.get('x-agent-key');
  if (key && given && sameSecret(key, given)) return true;
  const origin = req.headers.get('origin');
  const host = req.headers.get('host');
  if (origin && host) {
    try { return new URL(origin).host === host; } catch { return false; }
  }
  return req.headers.get('sec-fetch-site') === 'same-origin';
}

/** True when the request must be refused (kept under the old name for the routes that already use it). */
export const foreignOrigin = (req: Request): boolean => !allowedCaller(req);

/** Shared guard: not an allowed caller → 403, too many calls → 429. Returns null when the request may proceed. */
export function guardRequest(req: Request, bucket: string, perMinute: number, globalPerHour: number): Response | null {
  if (!allowedCaller(req)) return Response.json({ error: 'forbidden' }, { status: 403 });
  if (tooMany(bucket, clientIp(req), perMinute, globalPerHour)) return Response.json({ error: 'rate_limited' }, { status: 429 });
  return null;
}
