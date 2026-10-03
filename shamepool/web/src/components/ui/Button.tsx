'use client';
import type { ButtonHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';

type Variant = 'primary' | 'secondary' | 'danger' | 'pool' | 'bot' | 'ghost';

const base =
  'relative inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3.5 min-h-[52px] ' +
  'font-display font-extrabold uppercase tracking-wide text-[15px] ' +
  'transition-[transform,box-shadow] duration-75 select-none ' +
  'active:translate-y-[4px] active:shadow-none disabled:opacity-50 disabled:pointer-events-none';

const variants: Record<Variant, string> = {
  primary: 'bg-primary text-white shadow-chunky [--edge:var(--color-primary-dark)] hover:brightness-105',
  secondary: 'bg-white text-primary border-2 border-surface-line shadow-chunky [--edge:var(--color-surface-line)]',
  danger: 'bg-ember text-white shadow-chunky [--edge:var(--color-ember-dark)]',
  pool: 'bg-sun text-ink shadow-chunky [--edge:var(--color-sun-dark)]',
  bot: 'bg-grape text-white shadow-chunky [--edge:var(--color-grape-dark)]',
  ghost: 'bg-transparent text-primary shadow-none active:translate-y-0',
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  full?: boolean;
  loading?: boolean;
  href?: string;
}

export function Button({ variant = 'primary', full = true, loading, href, className = '', children, disabled, ...rest }: Props) {
  const cls = `${base} ${variants[variant]} ${full ? 'w-full' : ''} ${className}`;
  if (href && !disabled) {
    return <Link href={href} className={cls}>{children}</Link>;
  }
  return (
    <button {...rest} disabled={disabled || loading} className={cls} aria-busy={loading || undefined}>
      {loading && <Loader2 className="animate-spin" size={20} strokeWidth={3} aria-hidden />}
      {children}
    </button>
  );
}
