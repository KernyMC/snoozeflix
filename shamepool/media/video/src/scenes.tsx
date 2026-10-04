import React from 'react';
import { Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { Captions, Headline, Phone, SceneFrame, WideFrame, Watermark, PHONE_SCREEN_H, PHONE_SCREEN_W } from './parts';
import { C, fontFamily } from './theme';
import type { SceneData } from './types';

const useS = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (delay: number, damping = 16) => spring({ frame: frame - delay, fps, config: { damping, stiffness: 120, mass: 0.8 } });
};

/* ------------------------------------------------------------------ title */
export const TitleScene: React.FC<{ scene: SceneData }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const s = useS();
  const logo = s(0, 12);
  const t = s(12);
  const sub = s(24);
  return (
    <SceneFrame scene={scene} bg={`radial-gradient(1100px 900px at 50% 38%, #fff4cf 0%, ${C.cream} 62%)`}>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, fontFamily }}>
        <Img src={staticFile('brand/Shamepool-Logo.png')} style={{ width: 430, height: 430, opacity: logo, transform: `scale(${0.6 + logo * 0.4}) translateY(${Math.sin(frame / 18) * 8}px)` }} />
        <div style={{ fontSize: 150, fontWeight: 900, letterSpacing: -5, color: C.indigo, lineHeight: 1, opacity: t, transform: `translateY(${(1 - t) * 40}px)` }}>
          shame<span style={{ color: C.goldDark }}>pool</span>
        </div>
        <div style={{ fontSize: 56, fontWeight: 800, color: C.slate, opacity: sub, transform: `translateY(${(1 - sub) * 30}px)` }}>{scene.title}</div>
      </div>
      <Captions scene={scene} x={360} y={950} width={1200} align="center" />
    </SceneFrame>
  );
};

/* ------------------------------------------------------------------ phone with real screenshots */
export const PhoneScene: React.FC<{ scene: SceneData }> = ({ scene }) => (
  <SceneFrame scene={scene}>
    <Watermark />
    <Headline title={scene.title} sub={scene.sub} chips={scene.chips} />
    <Captions scene={scene} />
    <Phone scene={scene} shots={scene.shots ?? []} />
  </SceneFrame>
);

/* ------------------------------------------------------------------ projector */
export const WideScene: React.FC<{ scene: SceneData }> = ({ scene }) => (
  <SceneFrame scene={scene}>
    <Watermark />
    <Headline title={scene.title} sub={scene.sub} x={295} y={30} width={1330} />
    <WideFrame scene={scene} img={scene.shots?.[0]?.img ?? 'b17_projector'} />
    <Captions scene={scene} x={295} y={985} width={1330} align="center" />
  </SceneFrame>
);

/* ------------------------------------------------------------------ iMessage (a design recreation using the real brain replies) */
export const IMessageScene: React.FC<{ scene: SceneData }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const s = useS();
  const enter = s(0, 16);
  const chat = scene.chat ?? [];
  const slot = scene.frames / (chat.length + 1.4);
  const BLUE = '#0A84FF';
  return (
    <SceneFrame scene={scene}>
      <Watermark />
      <Headline title={scene.title} sub={scene.sub} chips={scene.chips} />
      <Captions scene={scene} />
      <div style={{
        position: 'absolute', left: 1400 - (PHONE_SCREEN_W + 32) / 2, top: 540 - (PHONE_SCREEN_H + 32) / 2 + (1 - enter) * 90, width: PHONE_SCREEN_W + 32, height: PHONE_SCREEN_H + 32,
        borderRadius: 66, background: C.indigoDark, boxShadow: '0 50px 100px rgba(36,33,91,.38)', opacity: enter,
      }}>
        <div style={{ position: 'absolute', left: 16, top: 16, width: PHONE_SCREEN_W, height: PHONE_SCREEN_H, borderRadius: 50, overflow: 'hidden', background: '#fff', fontFamily: '-apple-system, "Segoe UI", Nunito, sans-serif' }}>
          <div style={{ height: 150, background: '#f6f6f8', borderBottom: '1px solid #ddd', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 14 }}>
            <Img src={staticFile('brand/Shamepool-Logo.png')} style={{ width: 62, height: 62 }} />
            <div style={{ fontSize: 22, fontWeight: 700, color: '#111' }}>Benny the Penny</div>
            <div style={{ fontSize: 15, color: '#8a8a8e' }}>ShamePool Squad Bot</div>
          </div>
          <div style={{ padding: '22px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {chat.map((m, i) => {
              const at = Math.round(slot * (i + 0.6));
              const typingFrom = m.from === 'bot' ? at - 26 : at;
              const showTyping = m.from === 'bot' && frame >= typingFrom && frame < at;
              const o = interpolate(frame, [at, at + 7], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
              const mine = m.from === 'me';
              return (
                <React.Fragment key={i}>
                  {showTyping && (
                    <div style={{ alignSelf: 'flex-start', background: '#e9e9eb', borderRadius: 22, padding: '14px 20px', display: 'flex', gap: 6 }}>
                      {[0, 1, 2].map((d) => <span key={d} style={{ width: 10, height: 10, borderRadius: 5, background: '#8a8a8e', opacity: 0.4 + 0.6 * Math.abs(Math.sin((frame - d * 4) / 5)) }} />)}
                    </div>
                  )}
                  {frame >= at && (
                    <div style={{
                      alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '82%', background: mine ? BLUE : '#e9e9eb', color: mine ? '#fff' : '#111',
                      borderRadius: 24, padding: '13px 19px', fontSize: 23, lineHeight: 1.25, opacity: o, transform: `translateY(${(1 - o) * 14}px)`,
                    }}>{m.text}</div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
          <div style={{ position: 'absolute', left: 16, right: 16, bottom: 20, height: 52, border: '1.5px solid #d1d1d6', borderRadius: 26, display: 'flex', alignItems: 'center', paddingLeft: 20, color: '#aeaeb2', fontSize: 21 }}>iMessage</div>
        </div>
      </div>
      <div style={{ position: 'absolute', left: 1400 - 210, top: 1012, width: 420, textAlign: 'center', fontSize: 20, fontWeight: 700, color: C.slate, fontFamily }}>
        Design recreation. Replies come from the real Squad Bot brain.
      </div>
    </SceneFrame>
  );
};

/* ------------------------------------------------------------------ architecture */
const NODES = [
  { name: 'Spacetime', text: 'Live state, rules and sync', color: C.indigo, icon: 'lock' },
  { name: 'Capital One Nessie', text: 'Every penalty as a transfer', color: C.green, icon: 'cash' },
  { name: 'Grok (xAI)', text: 'Bot, vision and goal coach', color: C.grape, icon: 'target' },
  { name: 'ElevenLabs', text: 'Voice and sound effects', color: C.goldDark, icon: 'chat' },
  { name: 'Photon Spectrum', text: 'The bot on iMessage', color: '#2c6663', icon: 'pin' },
];

export const TechScene: React.FC<{ scene: SceneData }> = ({ scene }) => {
  const s = useS();
  const frame = useCurrentFrame();
  const cx = 1370, cy = 540, R = 290;
  const pos = NODES.map((_, i) => {
    const a = (-90 + i * (360 / NODES.length)) * (Math.PI / 180);
    return { x: cx + Math.cos(a) * (R + 90), y: cy + Math.sin(a) * R + 20 };
  });
  const core = s(2, 14);
  return (
    <SceneFrame scene={scene}>
      <Watermark />
      <Headline title={scene.title} sub={scene.sub} chips={['270+ tests', 'Mock fallback']} />
      <Captions scene={scene} />
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
        {pos.map((p, i) => {
          const d = interpolate(frame, [20 + i * 26, 40 + i * 26], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke={NODES[i]!.color} strokeWidth={5} strokeLinecap="round" strokeDasharray="14 12" strokeDashoffset={d * 400} opacity={0.2 + (1 - d) * 0.6} />;
        })}
      </svg>
      <div style={{ position: 'absolute', left: cx - 190, top: cy - 110, width: 380, height: 220, borderRadius: 40, background: C.indigo, color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', transform: `scale(${0.6 + core * 0.4})`, opacity: core, boxShadow: '0 30px 70px rgba(36,33,91,.4)', fontFamily }}>
        <Img src={staticFile('brand/Shamepool-Logo.png')} style={{ width: 88, height: 88 }} />
        <div style={{ fontSize: 40, fontWeight: 900 }}>ShamePool</div>
        <div style={{ fontSize: 22, fontWeight: 700, opacity: 0.8 }}>one data contract</div>
      </div>
      {NODES.map((n, i) => {
        const a = s(18 + i * 26, 12);
        const p = pos[i]!;
        return (
          <div key={n.name} style={{
            position: 'absolute', left: p.x - 190, top: p.y - 62, width: 380, height: 124, borderRadius: 30, background: '#fff', border: `4px solid ${n.color}`,
            display: 'flex', alignItems: 'center', gap: 16, padding: '0 22px', opacity: a, transform: `scale(${0.7 + a * 0.3})`, boxShadow: '0 16px 40px rgba(36,33,91,.15)', fontFamily,
          }}>
            <Img src={staticFile(`icons/${n.icon}.png`)} style={{ width: 64, height: 64 }} />
            <div>
              <div style={{ fontSize: 30, fontWeight: 900, color: n.color, lineHeight: 1.1 }}>{n.name}</div>
              <div style={{ fontSize: 21, fontWeight: 700, color: C.slate, lineHeight: 1.2 }}>{n.text}</div>
            </div>
          </div>
        );
      })}
    </SceneFrame>
  );
};

/* ------------------------------------------------------------------ business model */
export const BusinessScene: React.FC<{ scene: SceneData }> = ({ scene }) => {
  const s = useS();
  const cards = scene.cards ?? [];
  const banner = s(Math.round(scene.frames * 0.74), 14);
  return (
    <SceneFrame scene={scene}>
      <Watermark />
      <Headline title={scene.title} sub={scene.sub} x={110} y={90} width={1500} />
      <div style={{ position: 'absolute', left: 110, top: 400, display: 'flex', gap: 36, fontFamily }}>
        {cards.map((c, i) => {
          const a = s(Math.round(scene.frames * (0.2 + i * 0.17)), 14);
          const accent = [C.gold, C.aqua, C.grape][i]!;
          return (
            <div key={c.title} style={{ width: 544, height: 360, borderRadius: 40, background: '#fff', border: `5px solid ${accent}`, padding: 36, boxSizing: 'border-box', opacity: a, transform: `translateY(${(1 - a) * 60}px) scale(${0.92 + a * 0.08})`, boxShadow: '0 26px 60px rgba(36,33,91,.14)' }}>
              <Img src={staticFile(`icons/${['pizza', 'fire', 'target'][i]}.png`)} style={{ width: 110, height: 110 }} />
              <div style={{ marginTop: 14, fontSize: 44, fontWeight: 900, color: C.indigo, lineHeight: 1.05 }}>{c.title}</div>
              <div style={{ marginTop: 12, fontSize: 28, fontWeight: 700, color: C.slate, lineHeight: 1.3 }}>{c.text}</div>
            </div>
          );
        })}
      </div>
      <div style={{ position: 'absolute', left: 110, top: 800, width: 1700, height: 96, borderRadius: 28, background: C.indigo, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 22, fontSize: 40, fontWeight: 900, fontFamily, opacity: banner, transform: `translateY(${(1 - banner) * 30}px)` }}>
        <Img src={staticFile('icons/check.png')} style={{ width: 56, height: 56 }} />
        Revenue comes from spending, never from failing.
      </div>
      <Captions scene={scene} x={110} y={950} width={1700} />
    </SceneFrame>
  );
};

/* ------------------------------------------------------------------ outro */
export const OutroScene: React.FC<{ scene: SceneData }> = ({ scene }) => {
  const s = useS();
  const frame = useCurrentFrame();
  const logo = s(0, 12);
  const t = s(10);
  const tag = s(22);
  const logos = ['Spacetime', 'Capital One Nessie', 'Grok', 'ElevenLabs', 'Photon'];
  return (
    <SceneFrame scene={scene} bg={`radial-gradient(1100px 900px at 50% 38%, #fff4cf 0%, ${C.cream} 62%)`}>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18, fontFamily }}>
        <Img src={staticFile('brand/Shamepool-Benny-the-Penny.png')} style={{ width: 360, height: 360, opacity: logo, transform: `scale(${0.6 + logo * 0.4}) translateY(${Math.sin(frame / 16) * 8}px)` }} />
        <div style={{ fontSize: 130, fontWeight: 900, letterSpacing: -4, color: C.indigo, lineHeight: 1, opacity: t, transform: `translateY(${(1 - t) * 40}px)` }}>shame<span style={{ color: C.goldDark }}>pool</span></div>
        <div style={{ fontSize: 54, fontWeight: 800, color: C.slate, opacity: tag }}>{scene.sub}</div>
        <div style={{ marginTop: 24, fontSize: 40, fontWeight: 900, color: C.indigo, background: C.gold, padding: '14px 40px', borderRadius: 999, opacity: tag }}>shamepool.vercel.app</div>
        <div style={{ marginTop: 18, display: 'flex', gap: 14, opacity: tag }}>
          {logos.map((l) => <span key={l} style={{ fontSize: 24, fontWeight: 800, color: '#2c6663', background: C.aquaLight, border: `3px solid ${C.aqua}`, padding: '8px 20px', borderRadius: 999 }}>{l}</span>)}
        </div>
        <div style={{ marginTop: 8, fontSize: 18, fontWeight: 700, color: C.slate, opacity: 0.8 }}>Photos via Wikimedia Commons (CC)</div>
      </div>
    </SceneFrame>
  );
};
