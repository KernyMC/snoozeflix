'use client';
import { Camera } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from './ui/Button';

/** Resize to ≤1024 px JPEG (q 0.8) and return base64 without the data: prefix (edge C14). */
export async function fileToJpegBase64(file: File, max = 1024): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('invalid_photo'); // C15
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('invalid_photo'));
      i.src = url;
    });
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')?.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', 0.8).split(',')[1] ?? '';
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function PhotoCapture({ onPhoto, disabled }: { onPhoto: (base64: string, previewUrl: string) => void; disabled?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onFile = async (f?: File) => {
    if (!f) return;
    setErr(null);
    setBusy(true);
    try {
      const b64 = await fileToJpegBase64(f);
      if (!b64) throw new Error('invalid_photo');
      onPhoto(b64, `data:image/jpeg;base64,${b64}`);
    } catch {
      setErr('That does not look like a photo. Try another one.');
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = '';
    }
  };

  return (
    <div className="space-y-2">
      <input ref={ref} type="file" accept="image/*" capture="environment" className="sr-only" aria-label="Take a photo" onChange={(e) => onFile(e.target.files?.[0])} />
      <Button onClick={() => ref.current?.click()} loading={busy} disabled={disabled}><Camera size={22} strokeWidth={3} />Take photo</Button>
      {err && <p role="alert" className="text-center text-sm font-extrabold text-ember-dark">{err}</p>}
    </div>
  );
}
