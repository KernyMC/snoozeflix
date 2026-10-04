import React from 'react';
import { Audio, Img, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import manifest from './manifest.json';
import { C, fontFamily } from './theme';
import type { Manifest, SceneData, Shot } from './types';

const tapOf = (img: string) => (manifest as Manifest).find((m) => m.name === img)?.tap ?? null;

/** 0 → 1 spring that starts after `delay` frames. */
export const useSpring = (delay = 0, damping = 18) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { damping, stiffness: 120, mass: 0.8 } });
};

/* ------------------------------------------------------------------ headline column */
export const Headline: React.FC<{ title: string; sub: string; chips?: string[]; x?: number; y?: number; width?: number }> = ({
  title, sub, chips, x = 110, y = 150, width = 840,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sp = (delay: number, damping = 18) => spring({ frame: frame - delay, fps, config: { damping, stiffness: 120, mass: 0.8 } });
  const b = sp(10);
  const words = title.split(' ');
  return (
    <div style={{ position: 'absolute', left: x, top: y, width, fontFamily }}>
      <div style={{ fontSize: 88, fontWeight: 900, lineHeight: 1.02, color: C.indigo, letterSpacing: -2 }}>
        {words.map((w, i) => {
          const s = sp(3 + i * 3);
          return (
            <span key={i} style={{ display: 'inline-block', marginRight: 20, opacity: s, transform: `translateY(${(1 - s) * 34}px)` }}>{w}</span>
          );
        })}
      </div>
      <div style={{ marginTop: 26, fontSize: 38, fontWeight: 700, color: C.slate, lineHeight: 1.25, opacity: b, transform: `translateY(${(1 - b) * 20}px)` }}>{sub}</div>
      {chips && (
        <div style={{ marginTop: 34, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {chips.map((c, i) => {
            const s = sp(22 + i * 6, 12);
            return (
              <span key={c} style={{
                opacity: s, transform: `scale(${0.7 + s * 0.3})`, background: C.aquaLight, color: '#2c6663', fontWeight: 800, fontSize: 28,
                padding: '10px 22px', borderRadius: 999, border: `3px solid ${C.aqua}`,
              }}>{c}</span>
            );
          })}
        </div>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ captions (subtitles from the narration) */
function chunks(text: string, size = 9): string[] {
  const words = text.split(/\s+/);
  const out: string[] = [];
  let cur: string[] = [];
  for (const w of words) {
    cur.push(w);
    if (cur.length >= size || /[.!?]$/.test(w)) { out.push(cur.join(' ')); cur = []; }
  }
  if (cur.length) out.push(cur.join(' '));
  return out;
}

export const Captions: React.FC<{ scene: SceneData; x?: number; y?: number; width?: number; align?: 'left' | 'center' }> = ({
  scene, x = 110, y = 880, width = 840, align = 'left',
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const parts = chunks(scene.vo);
  const total = parts.reduce((s, p) => s + p.split(' ').length, 0);
  const speakFrames = scene.audioSeconds * fps;
  let acc = 0;
  let idx = 0;
  const starts = parts.map((p) => { const s = (acc / total) * speakFrames; acc += p.split(' ').length; return s; });
  for (let i = 0; i < parts.length; i++) if (frame >= starts[i] - 2) idx = i;
  const local = frame - starts[idx];
  const o = interpolate(local, [0, 6], [0, 1], { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' });
  return (
    <div style={{ position: 'absolute', left: x, top: y, width, display: 'flex', justifyContent: align === 'center' ? 'center' : 'flex-start', fontFamily }}>
      <div style={{
        opacity: o, transform: `translateY(${(1 - o) * 10}px)`, background: 'rgba(36,33,91,0.94)', color: '#fff', fontSize: 34, fontWeight: 700,
        lineHeight: 1.25, padding: '16px 26px', borderRadius: 22, boxShadow: '0 12px 30px rgba(36,33,91,.25)',
      }}>{parts[idx]}</div>
    </div>
  );
};

/* ------------------------------------------------------------------ brand watermark */
export const Watermark: React.FC = () => (
  <div style={{ position: 'absolute', right: 60, top: 40, display: 'flex', alignItems: 'center', gap: 12, fontFamily, opacity: 0.9 }}>
    <Img src={staticFile('brand/Shamepool-Logo.png')} style={{ width: 54, height: 54 }} />
    <span style={{ fontSize: 34, fontWeight: 900, color: C.indigo, letterSpacing: -1 }}>shame<span style={{ color: C.goldDark }}>pool</span></span>
  </div>
);

/* ------------------------------------------------------------------ phone with real app screenshots */
export const PHONE_SCREEN_H = 880;
export const PHONE_SCREEN_W = Math.round((PHONE_SCREEN_H * 430) / 932);
const BEZEL = 16;

export const Tap: React.FC<{ x: number; y: number; start: number }> = ({ x, y, start }) => {
  const frame = useCurrentFrame();
  const t = (frame - start) / 22;
  if (t < 0 || t > 1) return null;
  const size = 40 + t * 120;
  return (
    <>
      <div style={{ position: 'absolute', left: x * PHONE_SCREEN_W - size / 2, top: y * PHONE_SCREEN_H - size / 2, width: size, height: size, borderRadius: '50%', border: `6px solid ${C.gold}`, opacity: 1 - t, boxShadow: '0 0 30px rgba(246,196,69,.8)' }} />
      <div style={{ position: 'absolute', left: x * PHONE_SCREEN_W - 17, top: y * PHONE_SCREEN_H - 17, width: 34, height: 34, borderRadius: '50%', background: 'rgba(246,196,69,.9)', transform: `scale(${1 - Math.abs(t - 0.2) * 0.8})`, opacity: t < 0.8 ? 1 : (1 - t) * 5 }} />
    </>
  );
};

export const Phone: React.FC<{ scene: SceneData; shots: Shot[]; cx?: number; cy?: number }> = ({ scene, shots, cx = 1400, cy = 540 }) => {
  const frame = useCurrentFrame();
  const enter = useSpring(0, 16);
  const float = Math.sin(frame / 40) * 5;
  const starts = shots.map((s) => Math.round(s.at * scene.frames));
  return (
    <>
      <div style={{
        position: 'absolute', left: cx - (PHONE_SCREEN_W + BEZEL * 2) / 2, top: cy - (PHONE_SCREEN_H + BEZEL * 2) / 2 + (1 - enter) * 90 + float,
        width: PHONE_SCREEN_W + BEZEL * 2, height: PHONE_SCREEN_H + BEZEL * 2, borderRadius: 66, background: C.indigoDark,
        boxShadow: '0 50px 100px rgba(36,33,91,.38), inset 0 0 0 3px #3a3780', opacity: enter, transform: `scale(${0.92 + enter * 0.08})`,
      }}>
        <div style={{ position: 'absolute', left: BEZEL, top: BEZEL, width: PHONE_SCREEN_W, height: PHONE_SCREEN_H, borderRadius: 50, overflow: 'hidden', background: C.cream }}>
          {shots.map((s, i) => {
            const start = starts[i];
            const end = i + 1 < shots.length ? starts[i + 1] : scene.frames;
            const tap = s.tap ? tapOf(s.img) : null;
            const fade = i === 0 ? 1 : interpolate(frame, [start, start + 9], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
            if (frame < start - 1) return null;
            const t = interpolate(frame, [start, end], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
            const zoom = 1 + t * (tap ? 0.07 : 0.035);
            const ox = (tap?.x ?? 0.5) * 100;
            const oy = (tap?.y ?? 0.4) * 100;
            return (
              <div key={s.img} style={{ position: 'absolute', inset: 0, opacity: fade }}>
                <Img src={staticFile(`shots/${s.img}.png`)} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${zoom})`, transformOrigin: `${ox}% ${oy}%` }} />
              </div>
            );
          })}
          {/* the tap that led to a shot happened on the PREVIOUS screen: show it just before the change */}
          {shots.map((s, i) => {
            const tap = s.tap && i > 0 ? tapOf(s.img) : null;
            return tap ? <Tap key={`tap-${i}`} x={tap.x} y={tap.y} start={starts[i]! - 13} /> : null;
          })}
        </div>
      </div>
      {shots.map((s, i) => s.sfx && (
        <Sequence key={`sfx-${i}`} from={starts[i]} durationInFrames={90}>
          <Audio src={staticFile(`sfx/${s.sfx}.mp3`)} volume={0.55} />
        </Sequence>
      ))}
    </>
  );
};

/* ------------------------------------------------------------------ wide screenshot (projector) */
export const WideFrame: React.FC<{ scene: SceneData; img: string }> = ({ scene, img }) => {
  const frame = useCurrentFrame();
  const enter = useSpring(4, 16);
  const t = interpolate(frame, [0, scene.frames], [0, 1], { extrapolateRight: 'clamp' });
  const w = 1330;
  const h = Math.round((w - 28) * 9 / 16) + 28;
  return (
    <div style={{ position: 'absolute', left: (1920 - w) / 2, top: 205 + (1 - enter) * 80, width: w, height: h, opacity: enter, transform: `scale(${0.95 + enter * 0.05})` }}>
      <div style={{ width: w, height: h, borderRadius: 28, overflow: 'hidden', background: C.indigoDark, padding: 14, boxShadow: '0 50px 100px rgba(36,33,91,.35)', boxSizing: 'border-box' }}>
        <div style={{ width: '100%', height: '100%', borderRadius: 16, overflow: 'hidden' }}>
          <Img src={staticFile(`shots/${img}.png`)} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${1 + t * 0.04})`, transformOrigin: '50% 30%' }} />
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ scene wrapper: audio + fades */
export const SceneFrame: React.FC<{ scene: SceneData; children: React.ReactNode; bg?: string }> = ({ scene, children, bg }) => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [0, 8, scene.frames - 8, scene.frames], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <div style={{ position: 'absolute', inset: 0, background: bg ?? `radial-gradient(1200px 800px at 80% 20%, #fff7de 0%, ${C.cream} 55%)`, opacity: o, fontFamily }}>
      <Audio src={staticFile(scene.audio)} volume={1} />
      {children}
    </div>
  );
};
