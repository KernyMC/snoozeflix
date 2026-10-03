# Prompt for Claude Code (Sonnet)

Open Claude Code inside `shamepool/` and paste everything below:

---

You are building **ShamePool** for MHacks 2026. Read first (source of truth):

1. `.specify/memory/constitution.md`
2. `specs/001-shamepool/spec.md`
3. `specs/001-shamepool/edge-cases.md`
4. `specs/001-shamepool/ui-spec.md`
5. `specs/001-shamepool/contracts.md`
6. `specs/001-shamepool/plan.md`
7. `specs/001-shamepool/tasks.md`
8. `specs/001-shamepool/data-model.md` (Phase B only)

Build **Phase A only**: complete frontend on the mock backend (`NEXT_PUBLIC_DATA_MODE=mock`).

Rules:
- UI code imports only from `@/data`. No component calls external APIs or knows the mode.
- `types.ts` exactly as `contracts.md`; business rules in `logic.ts` with vitest tests.
- Mock behaves like the real backend: latency, errors, idempotent penalties, cross-tab sync, per-tab identity.
- Every row in `edge-cases.md` must be handled and, where it's logic, tested.
- Use the `playful-gamified-ui` skill for every screen and component; it overrides the design direction in ui-spec.md.
- Check off `tasks.md` as you go; `npm run build` + `npm test` after each sub-phase.
- Don't ask questions unless truly blocked; log decisions in `DECISIONS.md`.
- Stop and report after A2, after A6, and when Phase A is done. Do not start Phase B until told.
