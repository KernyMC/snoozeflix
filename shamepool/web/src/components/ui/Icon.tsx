/** Custom ShamePool icons (256×256 transparent PNGs in /public/assets/icons). */
export const ICONS = {
  cash: '/assets/icons/cash.png',
  pizza: '/assets/icons/pizza.png',
  'frozen-face': '/assets/icons/frozen-face.png',
  lock: '/assets/icons/lock.png',
  check: '/assets/icons/check.png',
  'money-wings': '/assets/icons/money-wings.png',
  target: '/assets/icons/target.png',
  chat: '/assets/icons/chat.png',
  clock: '/assets/icons/clock.png',
  hourglass: '/assets/icons/hourglass.png',
  sleep: '/assets/icons/sleep.png',
  camera: '/assets/icons/camera.png',
  fire: '/assets/icons/fire.png',
  'thumbs-up': '/assets/icons/thumbs-up.png',
  'thumbs-down': '/assets/icons/thumbs-down.png',
  party: '/assets/icons/party.png',
  pin: '/assets/icons/pin.png',
  tv: '/assets/icons/tv.png',
  wrench: '/assets/icons/wrench.png',
  undo: '/assets/icons/undo.png',
  trash: '/assets/icons/trash.png',
  'goal-gym': '/assets/icons/goal-gym.png',
  'goal-book': '/assets/icons/goal-book.png',
  'goal-run': '/assets/icons/goal-run.png',
  'goal-yoga': '/assets/icons/goal-yoga.png',
  'goal-guitar': '/assets/icons/goal-guitar.png',
  'goal-target': '/assets/icons/goal-target.png',
} as const;

export type IconName = keyof typeof ICONS;

/** Icon keys offered in the goal picker. A goal stores one of these in its `emoji` field. */
export const GOAL_ICONS: IconName[] = ['goal-gym', 'goal-book', 'goal-run', 'goal-yoga', 'goal-guitar', 'goal-target'];

export function isIconName(value: unknown): value is IconName {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(ICONS, value);
}

/**
 * Decorative inline icon. With no `size` it scales with the surrounding text (1.25em);
 * pass a number for a fixed pixel size.
 */
export function Icon({ name, size, className = '' }: { name: IconName; size?: number | string; className?: string }) {
  const s = size === undefined ? '1.25em' : typeof size === 'number' ? `${size}px` : size;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={ICONS[name]} alt="" aria-hidden="true" draggable={false}
      className={`inline-block shrink-0 object-contain ${className}`}
      style={{ width: s, height: s, verticalAlign: '-0.22em' }} />
  );
}

/** A goal's icon: an icon key renders the image; anything else is legacy emoji text. */
export function GoalIcon({ value, size, className = '' }: { value?: string; size?: number | string; className?: string }) {
  if (isIconName(value)) return <Icon name={value} size={size} className={className} />;
  return <span className={className}>{value || <Icon name="goal-target" size={size} />}</span>;
}
