import type { HTMLAttributes } from 'react';

interface Props extends HTMLAttributes<HTMLDivElement> {
  tone?: 'default' | 'ember' | 'leaf' | 'sun' | 'grape' | 'sky';
  tappable?: boolean;
  selected?: boolean;
}

const tones = {
  default: 'bg-white border-surface-line [--edge:var(--color-surface-line)]',
  ember: 'bg-ember-light border-ember/40 [--edge:var(--color-ember)]',
  leaf: 'bg-leaf-light border-leaf/40 [--edge:var(--color-leaf)]',
  sun: 'bg-sun-light border-sun/50 [--edge:var(--color-sun)]',
  grape: 'bg-grape-light border-grape/40 [--edge:var(--color-grape)]',
  sky: 'bg-sky-light border-sky [--edge:var(--color-sky-dark)]',
};

export function Card({ tone = 'default', tappable, selected, className = '', ...rest }: Props) {
  return (
    <div
      {...rest}
      className={`border-2 rounded-2xl p-4 shadow-chunky-sm ${selected ? tones.sky : tones[tone]} ${
        tappable ? 'active:translate-y-[2px] active:shadow-none transition-transform duration-75 cursor-pointer' : ''
      } ${className}`}
    />
  );
}

export function Pill({ children, tone = 'sky', className = '' }: { children: React.ReactNode; tone?: 'sky' | 'leaf' | 'ember' | 'sun' | 'flame' | 'grape' | 'gray'; className?: string }) {
  const t = {
    sky: 'bg-sky-light text-sky-dark', leaf: 'bg-leaf-light text-leaf-dark', ember: 'bg-ember-light text-ember-dark',
    sun: 'bg-sun-light text-sun-dark', flame: 'bg-flame-light text-flame-dark', grape: 'bg-grape-light text-grape-dark',
    gray: 'bg-surface-muted text-ink-soft',
  }[tone];
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-extrabold ${t} ${className}`}>{children}</span>;
}
