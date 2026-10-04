/**
 * In-memory abuse guard for the paid voice routes (per server instance, good enough for a demo).
 * A per-IP per-minute cap plus a global hourly budget so a public deploy cannot burn the credits.
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

export const clientIp = (req: Request): string => req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';

/** True when the request comes from another site (browsers send Origin on POST). */
export function foreignOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  const host = req.headers.get('host');
  if (!origin || !host) return false;
  try { return new URL(origin).host !== host; } catch { return true; }
}

/** Shared guard for the paid AI/voice routes: foreign origin → 403, too many calls → 429. Returns null when allowed. */
export function guardRequest(req: Request, bucket: string, perMinute: number, globalPerHour: number): Response | null {
  if (foreignOrigin(req)) return Response.json({ error: 'forbidden' }, { status: 403 });
  if (tooMany(bucket, clientIp(req), perMinute, globalPerHour)) return Response.json({ error: 'rate_limited' }, { status: 429 });
  return null;
}
