'use client';
import dynamic from 'next/dynamic';
import { Crosshair } from 'lucide-react';
import { useState } from 'react';
import { Button } from './ui/Button';
import { Skeleton } from './ui/States';
import type { LatLng } from './LocationPickerMap';

const Map = dynamic(() => import('./LocationPickerMap'), { ssr: false, loading: () => <Skeleton className="h-56 w-full" /> }); // U11

export function geoError(e: GeolocationPositionError | { code: number }): string {
  if (typeof window !== 'undefined' && !window.isSecureContext) return 'Open the https link: browsers block GPS on http.'; // U12
  if (e.code === 1) return 'Location is blocked. Allow it in your browser settings.'; // C1
  if (e.code === 3) return 'GPS timed out. Try again near a window.'; // C2
  return 'Could not get your position. Try again.';
}

export function LocationPicker({ value, radiusM, onChange }: { value: LatLng; radiusM: number; onChange: (p: LatLng) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const locate = () => {
    setErr(null);
    if (!navigator.geolocation) return setErr('This browser has no GPS.');
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (p) => { setBusy(false); onChange({ lat: p.coords.latitude, lng: p.coords.longitude }); },
      (e) => { setBusy(false); setErr(geoError(e)); },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };
  return (
    <div className="space-y-2">
      <div className="rounded-2xl border-2 border-surface-line overflow-hidden"><Map value={value} radiusM={radiusM} onChange={onChange} /></div>
      <p className="text-xs font-bold text-ink-faint">Tap the map or drag the pin. The blue circle is where you must be.</p>
      <Button variant="secondary" onClick={locate} loading={busy} type="button"><Crosshair size={20} strokeWidth={3} />Use my location</Button>
      {err && <p role="alert" className="text-sm font-extrabold text-ember-dark">{err}</p>}
    </div>
  );
}
