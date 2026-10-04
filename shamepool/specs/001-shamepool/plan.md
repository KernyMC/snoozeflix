# Implementation Plan: ShamePool (frontend first)

## Architecture
```
              UI (Next.js pages + components)
                         │  imports only
                         ▼
                 src/data/index.ts  ← NEXT_PUBLIC_DATA_MODE
                 ┌───────┴────────┐
         src/data/mock/      src/data/live/
   Zustand + localStorage     SpacetimeDB client SDK
   + BroadcastChannel         + Next.js server routes:
   + fake AI/money              /api/verify-photo, /api/bridge/tick,
                                /api/relay/webhook, /api/bot
```
`src/data/logic.ts` = pure rules shared by mock and the SpacetimeDB module.

## Structure
```
shamepool/
├── web/src/app/ components/ data/{types,logic,index}.ts data/mock/* data/live/*
├── spacetimedb/src/index.ts       # Phase B
└── scripts/                       # Phase B
```

## Phase A — Frontend (mock)
Deps: `zustand framer-motion react-leaflet leaflet canvas-confetti qrcode.react lucide-react zod vitest`.
Order: contracts + logic (+tests) → mock backend (+tests) → design system → screens by story → projector + demo panel → edge-case hardening → polish.

## Phase B — Connect services
SpacetimeDB → live layer → Nessie bridge → Gemini → Relay → domain.

## Environment
```
NEXT_PUBLIC_DATA_MODE=mock
NEXT_PUBLIC_DEMO=true
# AI/voice: XAI_API_KEY (XAI_MODEL), ELEVENLABS_API_KEY, AGENT_API_KEY; see the repository README for the full table
# Phase B: NEXT_PUBLIC_STDB_URI, NEXT_PUBLIC_STDB_DB, STDB_BRIDGE_TOKEN, NESSIE_API_KEY, GEMINI_API_KEY, RELAY_API_KEY, RELAY_WEBHOOK_SECRET, BRIDGE_TICK_SECRET
```

## Risks
| Risk | Fallback |
|---|---|
| Phase B late | Mock mode fully demo-able; order: Spacetime → Nessie → Gemini → Relay |
| Service down on stage | Second Vercel deployment in mock mode |
| Live diverges from mock | Shared types + `logic.ts` + shared test vectors |
| Indoor GPS | 150 m radius + "Pretend I'm there" |
