'use client';
import L from 'leaflet';
import { useEffect } from 'react';
import { Circle, MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';

export interface LatLng { lat: number; lng: number }

const pin = L.divIcon({
  className: '',
  html: '<div style="font-size:34px;line-height:34px;transform:translate(-50%,-100%)">📍</div>',
  iconSize: [0, 0],
});

function Clicker({ onChange }: { onChange: (p: LatLng) => void }) {
  useMapEvents({ click: (e) => onChange({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}
function Recenter({ value }: { value: LatLng }) {
  const map = useMap();
  useEffect(() => { map.setView([value.lat, value.lng], map.getZoom(), { animate: true }); }, [value.lat, value.lng, map]);
  return null;
}

export default function LocationPickerMap({ value, radiusM, onChange, readOnly }: { value: LatLng; radiusM: number; onChange?: (p: LatLng) => void; readOnly?: boolean }) {
  return (
    <MapContainer center={[value.lat, value.lng]} zoom={16} className="h-56 w-full" scrollWheelZoom={false} dragging={!readOnly || true}>
      <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <Circle center={[value.lat, value.lng]} radius={radiusM} pathOptions={{ color: '#75BFBC', fillColor: '#75BFBC', fillOpacity: 0.2, weight: 3 }} />
      <Marker position={[value.lat, value.lng]} icon={pin} draggable={!readOnly}
        eventHandlers={{ dragend: (e) => { const p = (e.target as L.Marker).getLatLng(); onChange?.({ lat: p.lat, lng: p.lng }); } }} />
      {!readOnly && <Clicker onChange={(p) => onChange?.(p)} />}
      <Recenter value={value} />
    </MapContainer>
  );
}
