import { Fragment, type ReactNode } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, Skull, Trophy, type LucideIcon } from 'lucide-react';
import { Icon, type IconName } from './Icon';

/**
 * Arrow and emoji characters that app-written text (feed events, Squad Bot replies) may contain,
 * mapped to the icon drawn in their place. A string is one of the custom PNG icons, a component
 * is a lucide icon.
 */
const GLYPHS: Record<string, IconName | LucideIcon> = {
  '→': ArrowRight,
  '←': ArrowLeft,
  '👇': ArrowDown,
  '🔥': 'fire',
  '🍕': 'pizza',
  '🎉': 'party',
  '🥶': 'frozen-face',
  '💀': Skull,
  '🏆': Trophy,
};

const SPLIT = new RegExp(`(${Object.keys(GLYPHS).join('|')})`, 'u');

/** Inline lucide icon that sits on the text baseline and scales with the font size. */
export function InlineIcon({ icon: Glyph, className = '' }: { icon: LucideIcon; className?: string }) {
  return <Glyph aria-hidden size="1.1em" strokeWidth={3} className={`inline-block shrink-0 align-[-0.15em] ${className}`} />;
}

/** Renders text with its arrow and emoji characters swapped for icons, so no glyph depends on the device font. */
export function IconText({ children }: { children: string }): ReactNode {
  const parts = children.split(SPLIT);
  if (parts.length === 1) return children;
  return parts.map((part, i) => {
    const glyph = GLYPHS[part];
    if (!glyph) return <Fragment key={i}>{part}</Fragment>;
    return typeof glyph === 'string' ? <Icon key={i} name={glyph} /> : <InlineIcon key={i} icon={glyph} />;
  });
}
