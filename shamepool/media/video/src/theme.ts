import { loadFont } from '@remotion/google-fonts/Nunito';

export const { fontFamily } = loadFont('normal', { weights: ['600', '700', '800', '900'], subsets: ['latin'] });

export const C = {
  indigo: '#24215B',
  indigoDark: '#14123A',
  gold: '#F6C445',
  goldDark: '#A67C0A',
  aqua: '#75BFBC',
  aquaLight: '#E3F2F1',
  cream: '#FAF7EE',
  white: '#FFFFFF',
  slate: '#666779',
  line: '#E5E2D9',
  green: '#287A58',
  red: '#B83D49',
  redLight: '#F8E4E6',
  grape: '#4B4789',
};

export const FPS = 30;
export const W = 1920;
export const H = 1080;
