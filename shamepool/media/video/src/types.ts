export interface Shot { img: string; at: number; tap?: boolean; sfx?: 'flake' | 'success' | 'cash' | 'nudge' }
export interface Card { icon: string; title: string; text: string }
export interface ChatMsg { from: 'me' | 'bot'; text: string }

export interface SceneData {
  id: string;
  layout: 'title' | 'phone' | 'wide' | 'imessage' | 'tech' | 'business' | 'outro';
  title: string;
  sub: string;
  vo: string;
  audio: string;
  audioSeconds: number;
  frames: number;
  chips?: string[];
  shots?: Shot[];
  chat?: ChatMsg[];
  cards?: Card[];
}

export interface TapPoint { x: number; y: number }
export type Manifest = { name: string; tap: TapPoint | null; note: string }[];
