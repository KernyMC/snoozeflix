import React from 'react';
import { Sequence } from 'remotion';
import { BusinessScene, IMessageScene, OutroScene, PhoneScene, TechScene, TitleScene, WideScene } from './scenes';
import timeline from './timeline.json';
import type { SceneData } from './types';

const scenes = timeline.scenes as unknown as SceneData[];
export const TOTAL_FRAMES = timeline.totalFrames;

const pick = (s: SceneData) => {
  switch (s.layout) {
    case 'title': return <TitleScene scene={s} />;
    case 'phone': return <PhoneScene scene={s} />;
    case 'wide': return <WideScene scene={s} />;
    case 'imessage': return <IMessageScene scene={s} />;
    case 'tech': return <TechScene scene={s} />;
    case 'business': return <BusinessScene scene={s} />;
    case 'outro': return <OutroScene scene={s} />;
  }
};

export const Demo: React.FC = () => {
  let from = 0;
  return (
    <>
      {scenes.map((s) => {
        const start = from;
        from += s.frames;
        return (
          <Sequence key={s.id} from={start} durationInFrames={s.frames}>
            {pick(s)}
          </Sequence>
        );
      })}
    </>
  );
};
