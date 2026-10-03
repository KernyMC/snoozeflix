# ShamePool Constitution

## Purpose
ShamePool is a group accountability app built for MHacks 2026 (FinTech track). You commit to a personal goal (e.g. "gym 4x/week"), verified by GPS + photo. If you flake, you're automatically charged into a **shared group pool** with your friends. The pool funds a group outing. A live leaderboard shows who keeps their word and who doesn't. It has to *hurt* to flake: money + social visibility.

## Build strategy: frontend first, services last
1. **Phase A — Frontend on a mock backend.** The whole app (every screen, every flow, the demo script) runs end to end with `NEXT_PUBLIC_DATA_MODE=mock`: an in-browser store with seeded data, simulated real-time sync between tabs, and fake AI/money responses.
2. **Phase B — Connect services.** Implement the same contracts with real services (SpacetimeDB, Nessie, Gemini, Relay) and flip `NEXT_PUBLIC_DATA_MODE=live`. Screens must not change during Phase B.

## Principles
1. **Contracts are law.** UI code only talks to the hooks and actions in `contracts.md`. No component imports a service SDK, `fetch`es an external API, or knows whether it's mock or live.
2. **Demo first.** Every feature must show up in the 2-minute live demo. If judges won't see it, it doesn't get built (except edge-case hardening, which protects the demo).
3. **Mock is a first-class backend.** Latency (300–800 ms), errors, escalation math, idempotent penalties, live updates across tabs. Mock mode is also the stage fallback if wifi dies.
4. **SpacetimeDB is the live core.** In live mode all state + logic live in the SpacetimeDB module; external I/O (Nessie, Gemini, Relay) goes through an outbox drained by Next.js server routes.
5. **Money moves for real (in sandbox).** Live charges are Capital One Nessie transfers. Money is integer cents everywhere. Never floats.
6. **Pain is the product.** Losses are visible, escalating and social. Wins are celebrated.
7. **Not gambling.** Nobody wins anyone else's money; penalties fund a shared pool spent together.
8. **Mobile web first.** 375 px phones + projector view. GPS + camera via browser APIs, HTTPS via Vercel.
9. **Secrets server-side.** Keys only in Next.js server routes.
10. **Boring, small code.** One Next.js app, Tailwind, few dependencies.
11. **Fail safe, never fail silent.** Every action returns a typed `Result`; every screen has loading/empty/error states; no action can charge money twice or drive a balance below zero.
12. **Design = `playful-gamified-ui` skill.** Light, chunky, rounded, mascot "Flakey". It overrides the dark theme in older notes.

## Tech constraints
- Next.js 15 (App Router) + TypeScript + Tailwind CSS, `framer-motion`, `react-leaflet`, `lucide-react`
- Mock: Zustand store persisted to `localStorage` + `BroadcastChannel` for cross-tab sync
- Live: SpacetimeDB (TS module + TS client SDK), Capital One Nessie, Google Gemini (`@google/genai`), Relay
- Deploy: Vercel; domain `shamepool.tech`
