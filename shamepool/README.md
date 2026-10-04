# ShamePool

**Skip the task. Lose the cash.** Friends commit to goals (gym, study, run), prove them with **GPS + a photo checked by AI**, and every flake moves money from the flaker into a **shared squad pool**. Nobody wins anyone else's money: the pool is spent together by vote, and if nobody spends it in time it goes to the squad's **charity**. Built for MHacks 2026 (FinTech track).

Live demo: https://shamepool.vercel.app, running on the real Spacetime backend (shared state across devices: create a squad on one phone, scan its QR on another). Demo accounts: `kevin`, `ana`, `leo`, `maya`, password `Password1` (see `web/src/data/mock/demoUsers.json`).

## What makes it different
- **Behavioral finance, not gambling.** Penalties escalate (x2 per flake in a row, capped), fund a shared pool, and can never be paid out as cash or refunded to the flaker. Members can withdraw only their own balance minus a **locked stake** (the worst case of the next 3 days) after a cooling period, so nobody can flake-and-run. See `specs/001-shamepool/withdrawals.md`.
- **Real AI doing real work (Grok / xAI):** the Squad Bot answers any question with the squad's real data and proposes penalty changes that the engine validates and the user confirms; vision verifies check-in photos (a couch is rejected with a roast); a coach turns one sentence into a full commitment. Replies are always English.
- **Voice (ElevenLabs):** talk to Benny the Penny and hear it answer, sound effects, deadline reminders and notifications.
- **Charity rule:** a full pool nobody spends within 7 days (3 minutes in demo mode) is donated automatically. See `specs/001-shamepool/charity.md`.
- **Same agent on iMessage (Photon Spectrum):** the Squad Bot brain is reachable by text. See `photon/` notes below.

## Architecture
```
Browser (Next.js 15 App Router, Tailwind, framer-motion)
   │  imports only @/data (contracts.md)
   ▼
src/data/index.ts ── NEXT_PUBLIC_DATA_MODE ─┬─ mock/  Zustand + localStorage + BroadcastChannel (default, also the stage fallback)
                                            └─ live/  Spacetime client (subscriptions + procedures)
Server routes (keys never reach the browser):
  /api/ai/{chat,coach,verify-photo}   xAI Grok
  /api/voice/{speak,transcribe}       ElevenLabs
  /api/bridge/{tick,poke}             Spacetime outbox → Capital One Nessie (sandbox transfers)
spacetimedb/  the whole backend as a Spacetime module (tables, reducers, scheduled deadline checks, outbox)
```
Pure business rules live in `web/src/data/logic.ts` (shared by the mock and the module) and are covered by tests.

## Run it
```sh
cd web
npm install
cp .env.example .env.local   # or create it, see below
npm run dev                  # http://localhost:3000
npm test                     # 270+ unit tests
npx tsc --noEmit && npx eslint src
```

### Environment (`web/.env.local`, never committed)
| Variable | Needed for |
|---|---|
| `NEXT_PUBLIC_DATA_MODE` | `mock` (default) or `live` |
| `NEXT_PUBLIC_DEMO` | `true` shows the purple demo tools for every signed-in user |
| `XAI_API_KEY` (`XAI_MODEL` optional) | Squad Bot brain, photo verification, goal coach |
| `ELEVENLABS_API_KEY` (`ELEVENLABS_VOICE_ID` optional) | voice in/out, sound effects are pre-generated static files |
| `AGENT_API_KEY` | lets a trusted server (the iMessage agent) call the AI route; browsers use same-origin instead |
| `NESSIE_API_KEY`, `NESSIE_MODE` | Capital One sandbox bridge (`mock` uses an in-memory twin) |
| `NEXT_PUBLIC_STDB_URI`, `NEXT_PUBLIC_STDB_DB`, `STDB_BRIDGE_TOKEN`, `BRIDGE_TICK_SECRET` | live mode (Spacetime) |

## Demo (2 minutes) and how to stage it
Mock mode keeps data **in one browser**, so run every screen as **windows of the same browser on one laptop**: the projector (`/squad?tv=1`) in one window, a phone-sized window for the check-in, and a third for another teammate (sign in as a different seeded user in each; sessions are per tab). Do not expect a phone and a laptop to sync with each other until live mode is on. Seeded goals are due every day with late deadlines, so the demo works any weekday or hour. Keep the purple wrench panel ready: **Pretend I'm there**, **Next photo fails** (backup for the couch-photo step), **Flake now**, **Skip to 1 min before deadline**, **Skip pool deadline (charity)**.

## Specs and decisions
`specs/001-shamepool/` (spec, contracts, edge cases, withdrawals, charity), `docs/` (backend contract, Nessie contract, voice, audit report), `DECISIONS.md`.

## Honest limits
- Nessie's sandbox records ledger entries but does **not** move balances; balances live in Spacetime/the mock. Every penalty still produces a real Nessie transfer record.
- The charity rule and the AI bot context run in **mock mode only**; the live Spacetime module still needs them (and the demo-reducer authorization fixes listed in `docs/audit-report.md`).
- Notifications work while the app is open (no server push yet).

## iMessage agent (Photon Spectrum)
The `photon/` folder (kept outside the web app) is a long-running agent that shares this app's brain by calling `/api/ai/chat`. It cannot run on Vercel (it holds a persistent connection); run it with `bun start` on a laptop or any always-on host.
