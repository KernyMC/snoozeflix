# Tasks: ShamePool (frontend first)

After every phase: `npm run build` + `npm test` pass.

# PHASE A — FRONTEND ON MOCK

## A1 — Foundation
- [x] T001 Next.js 15 app in `web/`; deps
- [x] T002 Tailwind tokens + Nunito (playful-gamified-ui)
- [x] T003 `types.ts`
- [x] T004 `logic.ts` + vitest (incl. edge cases P2,P4,T2,T5,G5,G10)

## A2 — Mock backend
- [x] T006 store + seed
- [x] T007 sync + tab identity
- [x] T008 actions (validation per edge-cases.md)
- [x] T009 hooks + scheduler (catch-up)
- [x] T010 bot
- [x] T011 index.ts mode switch
- [x] T011b mock tests (idempotency, balance floor, invariants)

## A3 — Shell & design system
- [x] T012 AppShell, ProjectorShell, Button, Card, Chip, ProgressBar, Benny the Penny
- [x] T013 MoneyText, CountUp, Toast, Skeleton, Empty/Error, OfflineBanner
- [x] T014 DemoPanel

## A4 US1 · A5 US2 · A6 US3 · A7 US4/US5 · A8 US6/US7
- [x] T015–T027 per ui-spec.md

## A8b — Wallet & auth UI (see withdrawals.md)
- [x] T027a Wallet logic (stake, available, validation) + tests
- [x] T027b Mock: signUp/signIn/signOut, requestWithdrawal/cancelWithdrawal, settle scheduler + tests
- [x] T027c `/register`, `/login`, `/wallet`, `WithdrawSheet`, welcome + onboarding + settings wiring (built, not yet checked in a browser)

## A9 — Hardening & polish
- [ ] T028 Walk `edge-cases.md` row by row; reduced motion; 44 px targets
- [ ] T029 Run full demo script with 2 tabs

# PHASE B — CONNECT SERVICES (not started)
B1 SpacetimeDB · B2 Bridge + Nessie · B3 Gemini · B4 Relay · B5 Ship

## Cut list
Phase B: Relay actions → Relay → cash-out on Nessie → Gemini bot. Phase A: US7 → `/bot` page → Leaflet → stay timer.
