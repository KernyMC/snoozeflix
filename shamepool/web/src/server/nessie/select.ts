// SERVER ONLY (see types.ts). Picks the live client or the in-memory mock twin.
//   NESSIE_MODE=mock  -> mock twin (also used when NESSIE_MODE is unset and DEMO_MOCK=true)
//   otherwise         -> live sandbox, requires NESSIE_API_KEY
import { createNessieClient } from './client';
import { createMockNessie } from './mock';
import { NessieError, type NessieClient } from './types';

const g = globalThis as unknown as { __nessieClient?: { mode: string; client: NessieClient } };

export function nessieMode(): 'live' | 'mock' {
  const m = (process.env.NESSIE_MODE ?? '').toLowerCase();
  if (m === 'mock' || (m === '' && process.env.DEMO_MOCK === 'true')) return 'mock';
  return 'live';
}

/** Singleton per process (survives Next.js hot reload). */
export function getNessie(): NessieClient {
  const mode = nessieMode();
  if (g.__nessieClient?.mode === mode) return g.__nessieClient.client;
  let client: NessieClient;
  if (mode === 'mock') {
    client = createMockNessie({ latencyMs: [100, 300], applyBalances: process.env.NESSIE_MOCK_BALANCES === 'true' });
  } else {
    const apiKey = process.env.NESSIE_API_KEY;
    if (!apiKey) {
      throw new NessieError({ status: 0, code: 'no_key', message: 'NESSIE_API_KEY is missing (set it in web/.env.local, or NESSIE_MODE=mock)', retryable: false });
    }
    client = createNessieClient({ apiKey, baseUrl: process.env.NESSIE_BASE_URL || undefined });
  }
  g.__nessieClient = { mode, client };
  return client;
}
