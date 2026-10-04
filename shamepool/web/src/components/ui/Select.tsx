'use client';
import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { inputCls } from './Field';

export interface SelectOption { value: string; label: string }

interface Props {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  onBlur?: () => void;
  id?: string;
  placeholder?: string;
  invalid?: boolean;
  'aria-label'?: string;
  /** Classes for the closed field. Defaults to the shared input look. */
  className?: string;
}

/** Room kept clear for the sticky header and the tab bar when deciding which way the list opens. */
const CHROME_TOP = 64;
const CHROME_BOTTOM = 88;

/**
 * Dropdown drawn by the app instead of the browser, so the list is exactly as wide as its field,
 * wraps long options and uses the app's colours. Focus stays on the field while the list is open
 * (the options are highlighted with aria-activedescendant), so `onBlur` fires once, on leaving.
 */
export function Select({ value, options, onChange, onBlur, id, placeholder = 'Choose…', invalid, className = inputCls, ...aria }: Props) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [up, setUp] = useState(false);
  const field = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const selected = options.findIndex((o) => o.value === value);

  const show = () => { setActive(Math.max(selected, 0)); setOpen(true); };
  const pick = (i: number) => {
    const o = options[i];
    if (o && o.value !== value) onChange(o.value);
    setOpen(false);
  };
  const move = (i: number) => {
    const n = Math.min(Math.max(i, 0), options.length - 1);
    setActive(n);
    list.current?.children[n]?.scrollIntoView({ block: 'nearest' });
  };

  // Open upwards when the list would run off the bottom and there is room above; bring the chosen option into view.
  useLayoutEffect(() => {
    const f = field.current, l = list.current;
    if (!open || !f || !l) return;
    const r = f.getBoundingClientRect();
    const need = l.offsetHeight + 8;
    setUp(window.innerHeight - CHROME_BOTTOM - r.bottom < need && r.top - CHROME_TOP >= need);
    const item = l.children[Math.max(selected, 0)] as HTMLElement | undefined;
    if (item) l.scrollTop = item.offsetTop - (l.clientHeight - item.offsetHeight) / 2;
  }, [open, selected, options.length]);

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const k = e.key;
    if (k === 'Escape') {
      if (!open) return;
      e.preventDefault(); e.stopPropagation(); setOpen(false);
    } else if (k === 'Enter' || k === ' ') {
      e.preventDefault();
      if (open) pick(active); else show();
    } else if (k === 'ArrowDown' || k === 'ArrowUp' || k === 'Home' || k === 'End') {
      e.preventDefault();
      if (!open) show();
      else move(k === 'ArrowDown' ? active + 1 : k === 'ArrowUp' ? active - 1 : k === 'Home' ? 0 : options.length - 1);
    }
  };

  return (
    <div className="relative">
      <button ref={field} type="button" id={id} role="combobox" aria-haspopup="listbox" aria-expanded={open} aria-controls={`${uid}-list`}
        aria-activedescendant={open ? `${uid}-${active}` : undefined} aria-invalid={invalid || undefined} aria-label={aria['aria-label']}
        onClick={() => (open ? setOpen(false) : show())} onKeyDown={onKeyDown} onBlur={() => { setOpen(false); onBlur?.(); }}
        className={`${className} flex items-center justify-between gap-3 text-left ${open ? 'border-sky bg-white' : ''}`}>
        <span className="min-w-0 break-words">{selected >= 0 ? options[selected].label : placeholder}</span>
        <ChevronDown aria-hidden size={20} strokeWidth={3} className={`shrink-0 text-ink-soft transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        // Keeping the pointer from taking focus off the field means choosing an option never fires a stray blur.
        <ul ref={list} id={`${uid}-list`} role="listbox" onMouseDown={(e) => e.preventDefault()}
          className={`absolute inset-x-0 z-40 ${up ? 'bottom-full mb-1.5' : 'top-full mt-1.5'} max-h-[22rem] overflow-y-auto overscroll-contain rounded-xl border-2 border-surface-line bg-white p-1.5 shadow-[0_4px_0_0_var(--color-surface-line),0_14px_28px_-10px_rgba(36,33,91,0.35)]`}>
          {options.map((o, i) => (
            <li key={o.value} id={`${uid}-${i}`} role="option" aria-selected={i === selected}
              onClick={() => pick(i)} onPointerMove={() => { if (i !== active) setActive(i); }}
              className={`flex items-start justify-between gap-2 rounded-lg px-3 py-2.5 font-bold leading-snug cursor-pointer ${
                i === active ? 'bg-sky-light' : ''} ${i === selected ? 'text-sky-dark' : 'text-ink'}`}>
              <span className="min-w-0 break-words">{o.label}</span>
              {i === selected && <Check aria-hidden size={18} strokeWidth={3.5} className="shrink-0 mt-0.5" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
