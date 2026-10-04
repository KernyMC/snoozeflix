---
name: playful-gamified-ui
description: Use when building or reviewing any ShamePool UI (screens, components, Tailwind styles, animations). Applies a playful, gamified, language-learning-app style (chunky 3D buttons, rounded cards, bright colors, big celebrations, mascot reactions) with ShamePool's own original brand. Supersedes the "Design direction" section of ui-spec.md.
---

# Playful Gamified UI (ShamePool)

Make every screen feel like a friendly, gamified learning app: bright, bouncy, rounded, rewarding. Users should *feel* a win (confetti, streak flame, mascot cheering) and *feel* a flake (mascot melting, red shake, sad sound-free animation).

**Inspired by the gamified-learning genre, but 100% original.** Never use another company's name, logo, mascot (no owls), proprietary fonts or copied screens. ShamePool has its own mascot, palette and wordmark below.

This skill **overrides the dark theme** in `ui-spec.md`: the app is **light by default**. The projector view (`/squad?tv=1`) also uses the light theme with extra-large type. Routes, components and states from `ui-spec.md` still apply.

---

## 1. Brand

- **Name/wordmark:** "shamepool" in lowercase, Nunito 900: "shame" in `ink`, "pool" in `sun-dark`. Never stylize it like another brand's wordmark.
- **Mascot: "Benny the Penny"** — a chubby, round snowflake/ice-cube character with big eyes. Drawn as simple inline SVG (circles + rounded hexagon arms), flat colors `sky-400`/white, 2–3 px `ink` outline.
  Moods (one SVG with variant props):
  - `happy` (default, smiling, slight bob animation)
  - `cheer` (arms up, sparkles) → successful check-in, streak milestone
  - `worried` (sweat drop) → deadline < 2 h away
  - `melting` (puddle under it, drooping) → flake / penalty
  - `smug` (side eye) → Squad Bot roast messages
  - `sleepy` → empty states
- **Voice:** short, cheeky, encouraging. Celebrate loudly, roast gently. Sentence case. Max ~8 words for button labels and headers.

## 2. Design tokens

**PALETTE OVERRIDE (authoritative):** Deep Indigo `#24215B` (primary buttons, headings, nav), Warm Gold `#F6C445` (money pools, stakes, rewards), Muted Aqua `#75BFBC` (progress bars, selected filters, accents), Soft Cream `#FAF7EE` (app background), White `#FFFFFF` (cards, forms, sheets), Slate Gray `#666779` (secondary text), Light Border `#E5E2D9`, Success Green `#287A58` (completed, confirmed payments), Alert Red `#B83D49` (missed, lost money, errors).
Tokens live in `web/src/app/globals.css` (`@theme`): `primary`, `ink`, `sun`, `sky` (=aqua), `leaf` (=success), `ember` (=alert), `flame` (streak, derived), `grape` (bot, derived indigo). Primary CTA = `bg-primary`, not green. Never hard-code hex in components; use these tokens.

Load Nunito from Google Fonts (`next/font/google`, weights 600, 700, 800, 900).

**Semantic mapping (never mix):** leaf = good/kept promise, ember = flake/money lost, sun = pool/shared money, flame = streak, grape = bot, sky = neutral action/info.

## 3. Core rules

1. **Everything is rounded.** Cards `rounded-2xl`, buttons `rounded-2xl`, inputs `rounded-xl`, avatars full circles. No sharp corners anywhere.
2. **Chunky 3D depth instead of soft shadows.** Interactive elements have a solid bottom edge (`shadow-chunky`) in a darker shade of their fill, and press *down* on tap. No blurry drop shadows.
3. **Thick borders.** Cards and inputs use `border-2 border-surface-line`. Selected states switch the border + edge to `sky`.
4. **Big, heavy type.** Headers Nunito 800–900, body 600–700. Numbers huge and tabular (`tabular-nums`). Uppercase only for tiny labels with `tracking-wide`.
5. **Lots of white space**, one primary action per screen, full-width primary button pinned to the bottom on mobile.
6. **Color carries meaning** (see mapping) but always paired with an icon/label.
7. **Every outcome gets a reaction:** success → confetti + mascot `cheer` + bounce; flake → mascot `melting` + red shake + penalty amount counting up.
8. **Progress is always visible:** progress bars for pool, stay timer rings, streak flame counter in the top bar.

## 4. Component recipes

### Button (the signature element)
```tsx
// variants: primary (leaf), secondary (white), danger (ember), pool (sun), bot (grape), ghost
const base =
  'relative inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3.5 ' +
  'font-display font-extrabold uppercase tracking-wide text-[15px] ' +
  'transition-[transform,box-shadow] duration-75 select-none ' +
  'active:translate-y-[4px] active:shadow-none disabled:opacity-50 disabled:active:translate-y-0';

const variants = {
  primary:   'bg-leaf text-white shadow-chunky [--edge:theme(colors.leaf.dark)] hover:brightness-105',
  secondary: 'bg-white text-sky border-2 border-surface-line shadow-chunky [--edge:theme(colors.surface.line)]',
  danger:    'bg-ember text-white shadow-chunky [--edge:theme(colors.ember.dark)]',
  pool:      'bg-sun text-ink shadow-chunky [--edge:theme(colors.sun.dark)]',
  bot:       'bg-grape text-white shadow-chunky [--edge:theme(colors.grape.dark)]',
  ghost:     'bg-transparent text-sky shadow-none active:translate-y-0',
};
```
Full-width on mobile (`w-full`), min height 52 px.

### Card
`bg-white border-2 border-surface-line rounded-2xl p-4 shadow-chunky-sm`. Tappable cards also press down (`active:translate-y-[2px] active:shadow-none`). Selected: `border-sky [--edge:theme(colors.sky.dark)] bg-sky-light`.

### Choice chips (days of week, emoji picker, plan options)
Square-ish tiles `rounded-xl border-2 shadow-chunky-sm`, large emoji/label centered, selected = sky border + sky-light fill.

### Inputs
`bg-surface-muted border-2 border-surface-line rounded-xl px-4 py-3 font-bold text-ink placeholder:text-ink-faint focus:border-sky focus:bg-white outline-none`.

### Progress bar (pool, weekly completion)
Track `h-4 rounded-full bg-surface-line`; fill `rounded-full bg-sun` (pool) or `bg-leaf` (completion) with a lighter 30%-height highlight stripe on top (`after:` pseudo-element, `bg-white/30`, `rounded-full`, inset 4 px). Animate width with spring.

### Streak flame
Top-bar pill: flame icon in `flame` + number in Nunito 900. Gray (`ink-faint`) when streak is 0. Bounces when it increments.

### Top bar (mobile)
Left: avatar circle. Center: streak flame, balance (`$` in ink), pool contribution chip in sun. Right: bot bubble icon. Height 56 px, white, bottom border `surface-line`.

### Bottom tab bar
White, top border 2 px `surface-line`, 5 tabs with big colorful icons (Home, Squad, + New goal as a raised round leaf button, Profile, Bot). Active tab: icon tinted + `sky-light` rounded background behind it.

### Leaderboard rows
Rank number in a colored circle (1 = sun, 2 = surface-line silver, 3 = flame bronze), avatar, name (800), completion % and streak on the right. "Flake of the Week" row gets `ember-light` background + melting mini-mascot + label chip. Rows animate reorder with `layout` (framer-motion).

### Feed items
Bubble-style cards: left icon circle colored by kind (leaf check-in, ember flake, sun milestone, grape bot, sky message). Bot messages: grape-light bubble with the `smug` mascot avatar. Amounts in bold with semantic color.

### Goal card
White card, left: big emoji/icon in a tinted rounded square; title (800), days as tiny pills, countdown "Due in 3h 12m" (ember if < 2 h, with `worried` mini mascot), right: streak flame + "next miss: $10" in ember. Status ribbon on top-right: "DONE TODAY" leaf / "DUE TODAY" sky / "FLAKED" ember.

### Check-in flow
Full-screen steps like a lesson:
- Top: close X + segmented progress bar (Locate → Stay → Photo → Verify).
- Center: large illustration (mascot) + big title + one-line subtitle.
- Stay timer: big circular ring (`stroke-leaf`, 14 px stroke, rounded caps) with time in the middle, mascot peeking.
- Bottom: full-width primary button.
- Result sheet slides up from the bottom (like an answer feedback banner): **leaf-light** sheet with "Nailed it!" + streak +1 for success; **ember-light** sheet with the roast + "Try again" for rejection. Sheet has a bold title, short line, and full-width button in matching color.

### Penalty / flake moment
Modal sheet `ember-light`, mascot `melting`, huge "-$10" counting up, line "Kevin flaked on Gym. The pool says thanks.", buttons "Ouch" (danger) and "Commit harder" (secondary). Screen shakes once (x: [0,-8,8,-6,6,0], 400 ms).

### Celebration
`canvas-confetti` burst in brand colors (leaf, sky, sun, flame, grape) + mascot `cheer` scale pop (0.6 → 1.1 → 1, spring) + big "+1 🔥" floating up.

### Empty states
Centered `sleepy` mascot, title (800), one cheeky line ("No commitments yet. Scared?"), primary button.

### Projector view
Light background `surface-muted`, three big white cards (Pool / Leaderboard / Feed), type scaled ×1.6, pool amount 96 px Nunito 900 in sun-dark with progress bar, QR code card to join. New feed items enter with a bounce.

## 5. Motion (framer-motion)

- Default spring: `{ type: 'spring', stiffness: 500, damping: 30 }`.
- Enter: fade + y 12 → 0. Pop: scale 0.9 → 1.05 → 1.
- Numbers: count up over 600 ms.
- Buttons: press handled by CSS translate (instant, 75 ms).
- Respect `prefers-reduced-motion`: disable bounces/shake/confetti, keep simple fades.

## 6. Icons & illustration

- Icons: `lucide-react` at stroke 2.5, size 24–28, colored by semantic token; or emoji for goal types (🏋️ 📚 🏃 🧘 🎸).
- Illustrations are only the original mascot and simple flat shapes. No stock illustrations, no other brands' characters.

## 7. Copy cheat sheet

| Moment | Copy |
|---|---|
| Check-in success | "Nailed it!" / "Promise kept. +1 🔥" |
| Photo rejected | Gemini roast, e.g. "That's a couch. Bold strategy." |
| Too far | "You're 1.2 km away. Nice try." |
| Flake | "-$10. The pool thanks you for your service." |
| Deadline soon | "2 hours left. Benny the Penny is sweating." |
| Pool milestone | "Halfway to Pizza night! 🍕" |
| Empty goals | "No commitments yet. Scared?" |

## 8. Review checklist (run before finishing any screen)

- [ ] Light theme, Nunito, all corners rounded, 2 px borders
- [ ] Interactive elements have a chunky bottom edge and press down
- [ ] One primary action per screen, full-width at the bottom on mobile
- [ ] Semantic colors respected (leaf/ember/sun/flame/grape/sky) + icon/label
- [ ] Success and flake each trigger a mascot reaction + animation
- [ ] Loading (skeletons with rounded shapes), empty (sleepy mascot), error states present
- [ ] Works at 375 px; tap targets ≥ 44 px; reduced motion respected
- [ ] No other brand's name, logo, mascot, font or copied layout
