'use client';

export const micSupported = (): boolean =>
  typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';

function pickMime(): string | undefined {
  for (const m of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']) {
    if (MediaRecorder.isTypeSupported?.(m)) return m;
  }
  return undefined;
}

export interface Recording {
  /** Resolves with the audio when recording ends (manual stop or the time limit). */
  done: Promise<Blob>;
  stop(): void;
  cancel(): void;
}

/** Starts recording the microphone. Throws if permission is denied. Stops by itself after `maxMs`. */
export async function startRecording(maxMs = 10_000): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mime = pickMime();
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks: Blob[] = [];
  let cancelled = false;
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const release = () => stream.getTracks().forEach((t) => t.stop());
  const done = new Promise<Blob>((resolve, reject) => {
    rec.onstop = () => {
      release();
      if (cancelled) reject(new Error('cancelled'));
      else resolve(new Blob(chunks, { type: rec.mimeType || mime || 'audio/webm' }));
    };
  });
  rec.start();
  const timer = window.setTimeout(() => { if (rec.state !== 'inactive') rec.stop(); }, maxMs);
  return {
    done,
    stop: () => { window.clearTimeout(timer); if (rec.state !== 'inactive') rec.stop(); },
    cancel: () => { window.clearTimeout(timer); cancelled = true; if (rec.state !== 'inactive') rec.stop(); else release(); },
  };
}

export type TranscribeResult = { ok: true; text: string } | { ok: false; error: 'no_speech' | 'rate_limited' | 'unavailable' | 'failed' };

export async function transcribe(blob: Blob): Promise<TranscribeResult> {
  if (blob.size < 800) return { ok: false, error: 'no_speech' }; // basically silence
  const ext = blob.type.includes('mp4') ? 'mp4' : blob.type.includes('ogg') ? 'ogg' : 'webm';
  const fd = new FormData();
  fd.append('audio', blob, `speech.${ext}`);
  try {
    const r = await fetch('/api/voice/transcribe', { method: 'POST', body: fd });
    if (r.ok) return { ok: true, text: ((await r.json()) as { text: string }).text };
    if (r.status === 422) return { ok: false, error: 'no_speech' };
    if (r.status === 429) return { ok: false, error: 'rate_limited' };
    if (r.status === 503) return { ok: false, error: 'unavailable' };
    return { ok: false, error: 'failed' };
  } catch {
    return { ok: false, error: 'failed' };
  }
}
