# ShamePool code audit

Auditor: code-auditor (read-only). Date: 2026-10-04. Scope: `web/` (Next.js app, API routes, mock and live data layers, server bridge, Nessie), `spacetimedb/src`, `scripts/`, config and the specs in `specs/001-shamepool` and `docs/`.
Method: read the specs, read the code, then check claims by running tsc, eslint and vitest, plus a throwaway probe script that drives the real mock engine (`web/src/data/mock/engine.ts`). The probe lives only in the auditor's scratchpad, and no source file was changed. `next build` / `next dev` were not run, per the charter. No secret values were read out or printed. Only variable names were listed.

---

## 1. Executive summary

**Verdict: READY WITH FIXES for the mock-mode stage demo. NOT READY for live mode (Spacetime).**

- **Build health is green.** `tsc` passes with 0 errors, `eslint` gives 0 errors and 7 warnings, `vitest` passes 240/240 tests in 19 files, and the Spacetime module's `tsc` passes with 0 errors.
- **The money engine is sound where it matters most.** A 4,000-step random fuzz of the real engine found:
  - 0 conservation violations (users + pools + donations + paid cash-outs + withdrawals stays constant)
  - 0 negative balances
  - 0 non-integer cents
  - 182 penalties, all under unique keys

  Escalation, the balance floor, idempotency, scheduler catch-up, strict-majority votes and escrowed withdrawals all behave as specified.
- **Three proven money-rule bugs:**
  1. The withdrawable stake drops while a flake is still pending. Proven: a user withdrew $20 of a $35 stake, and afterwards the stake ($30) was larger than the balance ($10).
  2. A goal with a 12:00 AM deadline can never be completed and is charged every scheduled day.
  3. The charity clock can be postponed forever by lowering and raising the pool goal.
- **Biggest stage risks:**
  1. The seeded schedules make the demo depend on the weekday. On Sunday 2026-10-04 only Kevin's library goal can be checked in, so no teammate can do step 3.
  2. Mock mode only syncs tabs in **one browser**. A phone and a projector on different devices will not see each other.
  3. Photo verification **fails open on every failure** (rate limit, timeout, missing key, 413). If xAI is slow or limited, the "couch photo gets roasted" step passes the couch.
- **Biggest security issue (live only):** the Spacetime reducers `set_demo_flags` and `reset_demo` have no authorization, and `demoMode` defaults to `true`. Anyone who knows the database name, which is hard-coded as the default `shamepool-mvp`, can wipe the database. They can also move the global clock forward so the scheduler charges every user up to 7 escalating penalties. This does not affect the default mock deploy, but it is a blocker for turning live mode on.

| Severity | Count |
|---|---|
| Critical | 1 |
| High | 5 |
| Medium | 9 |
| Low | 20 |
| Nit | 8 |

---

## 2. Checks that were run

| Check | Command / method | Result |
|---|---|---|
| TypeScript (web) | `npx tsc --noEmit` in `web/` | PASS, 0 errors |
| ESLint (web) | `npx eslint src` | PASS, 0 errors, 7 warnings (unused vars in `Cashout.tsx:27-28`, `CheckinFlow.tsx:110`, `live/index.ts:17`; `<img>` in `CheckinFlow.tsx:163`) |
| Unit tests | `npx vitest run` | PASS, 240/240 tests, 19 files |
| Spacetime module typecheck | `npx tsc --noEmit -p .` in `spacetimedb/` (no publish) | PASS, 0 errors |
| Shared-code drift | `diff` of web `logic/authLogic/billingLogic/sha256` against `spacetimedb/src/shared/*` | `logic`, `authLogic`, `billingLogic`, `sha256` identical. `types.ts` and `mappers.ts` stale (charity fields missing; see L11) |
| Money fuzz | Probe: 4,000 random actions (flake, withdraw, cancel, propose, vote, donate, set goal, check-in) plus scheduler ticks | 0 conservation violations, 0 negative balances, 0 non-integer, 182/182 unique penalty keys, 5 donations, 19 paid cash-outs |
| Stake under grace window | Probe | **FAIL**: see M1 |
| 00:00 deadline | Probe | **FAIL**: see M2 |
| Charity clock postponement | Probe | **FAIL**: see M6 |
| forceFlake on a friend's rest day | Probe | Allowed (see M7) |
| Demo seed by weekday | Probe at 2 PM, Sun 10/04 and Mon 10/05 | Sunday: only `kevin/Study at the library` OK; Monday: Ana `deadline_passed`, Maya `not_due_today` (see H3) |
| Secrets in source/docs | Regex scan for key-like strings (file names only), `.gitignore` review, env var name listing | No secrets found in source, docs or scripts; `.env*` and `.vercel` ignored |
| XSS sinks | grep `dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function` | None in app code |
| Emoji / Spanish / test text | grep | Emojis only in bot/feed strings, all mapped to icons by `IconText`; Spanish only inside the penalty-gate regex (intended) |

---

## 3. Findings

Each finding gives the file and line, the evidence, a failure scenario and a fix. "Risk" means a credible problem that was not reproduced. "Proven" means it was reproduced by a probe or follows directly from the code.

### Critical

**C1. Spacetime: unauthenticated `set_demo_flags` / `reset_demo`, with `demoMode` on by default (live)**
- Where: `spacetimedb/src/index.ts:134-152`, `spacetimedb/src/seed.ts:37`, `spacetimedb/src/core.ts:34`. The database name defaults to `shamepool-mvp` in `web/src/data/live/stdb.ts:12` and `web/src/server/stdb-bridge.ts:8`.
- Evidence:
  - `setDemoFlags` checks only `f.demoMode`. `resetDemo` throws only when `demoMode` is false.
  - `seedDemo` (run by `init`) writes `demoMode: true`. `envOf` falls back to `?? true`.
  - Neither reducer checks a session, the bridge identity or an admin.
  - `timeOffsetMs` is a single **global** clock used by `check_deadlines` (every 60 s).
- Failure scenarios (any anonymous client of the published module):
  - (a) `reset_demo` wipes every account, balance, squad and history.
  - (b) `set_demo_flags({setOffset:true,timeOffsetMs: 7 days})`: on the next tick, `evaluateDeadlines` charges every active goal for up to 7 missed dates with escalation ($5+10+20+40+40+40+40 = $195 per goal). That drains most of each user's $200 into pools. Resetting the offset does not refund anything, and `lastEvaluatedDate` is left in the future.
  - (c) `fakeOn` turns location spoofing on for every user.
  - The same client can also `force_flake` other users' goals (M7).
- Status: proven by code. Whether the module is currently published with data is **unverified** (`spacetime.json` points at maincloud and `spacetimedb/dist` exists).
- Fix:
  1. Require the bridge identity, or an allow-listed admin identity, for `set_demo_flags`, `reset_demo` and `set_demo_mode`.
  2. Default `demoMode` to `false` in `seedDemo` and `envOf`.
  3. Clamp `timeOffsetMs` (for example to ±24 h).
  4. Make the scheduler ignore the offset, or keep offsets per session instead of global.

### High

**H1. Photo verification fails open on any error, without limit (C17 says "fail-open once")**
- Where: `web/src/lib/ai/client.ts:9` (`r.ok ? json : null`), `web/src/components/CheckinFlow.tsx:98`, `web/src/data/mock/engine.ts:206-209`.
- Evidence:
  - Every non-2xx response becomes `null`: 400 `invalid_image`, 413 `image_too_large`, 429 `rate_limited`, 502, 503 `ai_unavailable`, and the 18 s client timeout.
  - `finishCheckin(..., null)` then accepts the photo with "AI check unavailable". This happens on every attempt, not once per check-in.
  - The vision route allows 10 calls per minute per IP and 150 per hour **per instance** (`verify-photo/route.ts:14`).
- Failure scenarios:
  - Demo step 4: if xAI is slow (the route allows 15 s), rate-limited, has a bad model id (`lib/server/xai.ts:11`, unverified) or `XAI_API_KEY` is missing on Vercel, the couch photo is **accepted** with confetti.
  - Any user can also skip verification by sending an oversized image.
- Fix:
  1. Treat 4xx client errors (400 or 413) as `invalid_photo` and ask for a retake.
  2. Fail open only for 5xx, 503 or timeout, and at most once per check-in. Store a flag on the check-in, and reject or retry on the second failure.
  3. Surface "AI unavailable" in the UI.
  4. Keep the demo panel's **"Next photo fails"** toggle as the stage fallback for step 4.

**H2. Mock mode cannot sync separate devices, but the demo script assumes it does**
- Where: `web/src/data/mock/store.ts` (localStorage plus `BroadcastChannel('shamepool')`), spec demo steps 2-6 and US4 acceptance ("every open screen... within ~2 s").
- Evidence: all state is kept per browser profile. `NEXT_PUBLIC_DATA_MODE=mock` locally, and mock is the default. `Projector.tsx:23-32` quietly claims Kevin in a fresh browser, so that browser starts from its **own** seed.
- Failure scenario: a teammate checks in on a phone, and the projector laptop shows nothing. The pool never "jumps" on the big screen.
- Fix: run every stage screen as tabs or windows of **one browser on one machine** (the projector as a second window on the same laptop), and rehearse that way. Alternatively, finish and harden live mode (C1, H4) first. Write the chosen topology into the demo script.

**H3. The seeded schedules make the demo depend on the weekday and the time of day**
- Where: `web/src/data/mock/seed.ts:48-54` (and `spacetimedb/src/seed.ts:75-81`).
- Proven with the probe at 2 PM:
  - **Sunday 2026-10-04**: Kevin Gym `not_due_today`, Kevin Library OK, Ana Run `not_due_today`, Leo Guitar `not_due_today`, Maya Yoga `not_due_today`.
  - **Monday**: Ana Run `deadline_passed` (9:00 AM deadline), Maya `not_due_today`.
- Failure scenario: demo step 3 ("teammate checks in at the gym") is blocked with "This goal is not due today" or "The deadline already passed". The time-skip button cannot change the day.
- Fix: seed at least one teammate goal for every day with a late deadline (for example 23:30). Alternatively, set the seed deadlines relative to `now` (now + 3 h) and use all 7 days. Rehearse at the real demo hour.

**H4. Turning live mode on loses demo features, and the live auth is open**
- Where:
  - `web/src/data/live/actions.ts:249-253`, `spacetimedb/src/game.ts:169-215`: no AI check; any "photo" of 8 or more characters passes.
  - `web/src/data/live/index.ts:22`: `getBotContext` returns `null`, so there is no AI bot.
  - `web/src/data/live/index.ts:17-21` with `web/src/app/charity/page.tsx:37`: `useCharityStatus()` returns `null`, so **/charity shows a loading skeleton forever**. The other charity actions return `unknown`.
  - `spacetimedb/src/auth.ts:98-103`: `claimSeedUser` has no `demoMode` check.
  - `spacetimedb/src/auth.ts:77-81`: `registerUser` creates unlimited users with $200 each, each queueing a `nessie_create_user` job that the public `/api/bridge/poke` drains.
- Failure scenarios:
  - Flipping `NEXT_PUBLIC_DATA_MODE=live` on stage breaks demo steps 4 and 6 and the charity screen.
  - Anyone can sign in as Kevin (no password) and withdraw his available balance or vote.
  - A script can mint unlimited accounts and burn the Nessie quota.
- Fix: keep the stage demo on mock (with H2 handled), or before using live:
  1. Gate `claimSeedUser` on `demoMode`.
  2. Rate-limit `registerUser` per identity.
  3. Make the charity page render "not available" when the status is `null`.
  4. Wire the verdict reducer the TODO describes.

**H5. Paid AI and voice routes are open proxies, and a global budget can be used to take the demo down**
- Where: `web/src/lib/server/limits.ts:8-36`; routes `api/ai/{chat,coach,verify-photo}` and `api/voice/{speak,transcribe}`.
- Evidence:
  - `foreignOrigin` returns `false` when there is **no** `Origin` header (line 27), so `curl` passes.
  - Limits are in-memory Maps per serverless instance and reset on cold start.
  - The per-IP key is the first `x-forwarded-for` value. Whether Vercel overwrites it is unverified.
  - The global hourly caps (chat 300, coach 120, vision 150, TTS 400, STT 300) are **per instance** and shared by every visitor.
- Failure scenarios:
  - (a) Cost: the chat route accepts 9 KB of arbitrary "context" plus a 400-character message, which makes it a free Grok proxy. `speak` is a free TTS endpoint for 280 characters.
  - (b) Availability: an attacker spends the hourly budget, every legitimate call gets 429, the bot falls back to keywords and photos fail open (H1) during judging.
- Fix:
  1. Require `Sec-Fetch-Site: same-origin`, or a present and matching `Origin`.
  2. Use a shared limiter (Vercel Firewall rate limiting, BotID, or Upstash) keyed on `x-vercel-forwarded-for` / `x-real-ip`.
  3. Lower the ceilings to what the demo needs.
  4. Consider a short-lived signed token issued to the page.

### Medium

**M1. The rolling stake stops counting today's exposure as soon as the deadline passes, even before the flake is charged (W6 gap)**
- Where: `web/src/data/logic.ts:240` (`if (i === 0 && (todayHandled || deadlinePassed(...))) continue;`), used by `mock/engine.ts:466-481` and `spacetimedb/src/game.ts:424-439`.
- Proven with the probe: a daily goal ($5 base) and a $35 balance. At 08:58 the stake is $35 and $0 is available. The user starts a check-in, so the 10-minute grace window applies. At 09:02 the stake is $15 and **$20 is available**, so the user withdraws $20. At 09:11 the $5 flake is charged and the balance is $10, while the new stake is **$30**, three times the balance.
  - The same gap exists between the deadline and the next scheduler tick (15 s in mock, 60 s in live), and while catch-up dates are still unprocessed.
- Failure scenario: "flake-and-run". A user empties the stake meant for the next days, and the next penalties end up as shortfalls, so the pool loses money it was owed.
- Fix: count today as exposure until it is handled (completed or penalty exists), whatever the deadline. Also add any `missedDates` not yet flaked. Add a test for this case (the existing W6 test does not cover it).

**M2. A 12:00 AM deadline (or any very early deadline) creates a goal that cannot be completed and is charged every scheduled day**
- Where: `web/src/data/logic.ts:93-95` (`localMinutes >= deadlineMinutes`), `logic.ts:205` (accepts 0); the goal form time input (`app/goals/new/page.tsx:108`).
- Proven with the probe: deadline 0. The next day `startCheckin` returns `deadline_passed`, and at 00:00:30 the scheduler charges $5. This repeats every scheduled day with escalation up to $40.
- Spec G6 says "Deadline 23:59 / 00:00 valid".
- Fix: treat 00:00 as end of day (1440), or reject deadlines earlier than `minStay + some buffer` with a clear message. Add a G6 test.

**M3. Lost-update race between tabs in the mock store**
- Where: `web/src/data/mock/store.ts:44-64`.
- Evidence:
  - `commit()` reads localStorage, mutates and writes back with no lock. Chrome syncs localStorage between renderer processes asynchronously.
  - `adopt()` ignores an incoming state with the **same** `rev`, so two tabs that commit together both write `rev+1` and diverge. The next commit wins and silently drops the other tab's change.
- Failure scenario (risk, not reproduced): the leader tab's scheduler tick (every 15 s) commits at the same moment the phone tab finishes a check-in. The completion is lost, and the next tick flakes the user who checked in. This is a wrongful charge, and it is most likely in the demo setup of a projector tab plus a check-in tab.
- Fix: wrap read, mutate and write in `navigator.locks.request('shamepool-commit', ...)`, or send all writes through the leader. Re-read after writing (compare-and-swap on `rev`). Break `rev` ties deterministically.

**M4. Voice "yes" confirmation is too broad**
- Where: `web/src/app/bot/page.tsx:209-210`, regex `^\s*(yes|yeah|yep|yup|confirm|do it|sure|ok|okay)\b`.
- Failure scenario: a pending "Gym: $5 to $40" action is open, and the user says "Okay, what's my streak?". The penalty change is confirmed without the user meaning it.
- Fix: accept only short whole-utterance confirmations (`^(yes|confirm|do it)[.!]?$`), within about 60 s of the prompt. Read back the change before applying it.

**M5. Spec and prize mismatch: Gemini is promised, but the code uses Grok**
- Where: `specs/001-shamepool/spec.md:13` ("MLH Best Use of Gemini: Gemini vision verifies photos; Gemini powers Squad Bot"); the code uses xAI only (`web/src/lib/server/xai.ts`).
- Evidence: `XAI_API_KEY` is used in 5 files and documented nowhere. `GEMINI_API_KEY` is documented, but no code uses it.
- Failure scenario: a Gemini prize submission is not eligible, or judges see docs that contradict the code.
- Fix: update the prize table, README and env docs to xAI, or add a Gemini path. Document `XAI_API_KEY` and `XAI_MODEL`.

**M6. The charity clock can be postponed forever (H2 rule bypass)**
- Where: `web/src/data/mock/engine.ts:374-387` (`setPoolGoal`) and `531-535` (`syncPoolFull`); any member can do this from `/settings` (`NewPoolGoal`).
- Proven with the probe: the pool is full at day 0. At day 6.9 a member sets the goal to $70 and then back to $60. At day 7.1 there are **0** donations, and the clock restarted at day 6.9.
- Fix: keep the original `poolFullAt` when the pool is full again within the same window, or require a vote to change the goal while the clock runs.

**M7. `forceFlake` ignores the schedule and the `active` flag, and lets any squad member flake someone else's goal**
- Where: `web/src/data/mock/engine.ts:265-276`, `spacetimedb/src/game.ts:269-282` (checks only `goal.squadId === me.squadId`).
- Proven with the probe: Kevin flaked Ana's run on her rest day and charged her $5.
- Failure scenario: in live mode (where `demoMode` is on by default, C1), any member can drain a friend's balance into the pool. The UI only shows the button for your own goals.
- Fix: require `goal.userId === me.id && goal.active`. The demo still works because the presenter flakes Kevin's own goal.

**M8. Repository layout and README**
- Where: the only `.git` is `web/.git`, with no remote configured. `flaketax/` (holding `spacetimedb/`, `scripts/`, `specs/`, `docs/`) is not a repository. `web/README.md` is the unchanged create-next-app boilerplate.
- Failure scenario: a fresh clone has no Spacetime module, no specs, no bridge scripts and no architecture doc. That works against the "Judged by an LLM: strong README" target.
- Status: unverified whether another repository exists, because git commands were not allowed.
- Fix: make `flaketax/` the repository root, or copy the module and docs in, and write a real README covering architecture, env vars and the demo.

**M9. Seeded goals never auto-flake on the seed day, and the seed has small inconsistencies**
- Where: `web/src/data/mock/seed.ts:60` (`lastEvaluatedDate: today`) and the same in `spacetimedb/src/seed.ts:101`.
- Failure scenario:
  - After "Reset demo data", a seeded deadline passing during the demo (for example Kevin's Gym at 6 PM) does nothing. Only "Flake now" charges, so the "automatic flake" story cannot be shown with seeded goals.
  - The seed feed text also says Leo flaked "3 h ago", but his penalty is dated 3 days ago, and the first demo flake triggers a late "Halfway to Pizza night!" announcement (L2).
- Fix: set `lastEvaluatedDate` to yesterday for goals whose deadline today has not passed yet, and align the seed feed timestamps.

### Low

| # | Where | What / scenario | Fix |
|---|---|---|---|
| L1 | `web/src/app/wallet/page.tsx:67` | The stake list prints the icon key as text, so it shows "goal-gym Gym" (the `emoji` field holds icon keys). Visible in any wallet demo. | Render `<GoalIcon value={s.emoji} />`. |
| L2 | `web/src/data/mock/engine.ts:223-233`, seed | The seed pool is already 58% full but no 50% milestone is recorded, so the first demo flake posts "Halfway to Pizza night!" at 75%. | Pre-record the `pool:squad_mhacks:6000:0.5` milestone in the seed. |
| L3 | `web/src/app/home/page.tsx:138`, `components/UpgradeBanner.tsx:7` | Kevin (free tier, 2 seeded goals) sees "2/1" goals and no "+ New commitment" button. The goal limit is enforced in the UI only; the engine allows 5. | Seed Kevin as paid, or make the limit a data-layer rule. |
| L4 | `web/src/components/voice/Alerts.tsx:38-51` | `seen` is not reset when the signed-in user changes, so after switching accounts up to 3 old bot lines are spoken and notifications fire. | Track the user id the way `FlakeWatcher` does. |
| L5 | `web/src/lib/voice.ts:74-94` | Two `speak()` calls with the same text at once both play (overlapping audio), and the first one cannot be stopped. | Use a request id or token instead of comparing text. |
| L6 | `web/src/lib/mic.ts:22-24` | If `new MediaRecorder` throws, the microphone stream stays open (the mic indicator stays on). | try/catch that stops the tracks. |
| L7 | `web/src/app/onboarding/page.tsx:34` | No identity redirects to `/` and drops `?join=`. The spec says to go to `/register` and keep the join code. Step 1 ("Who are you?") can no longer be reached (dead code). | Redirect with `withJoin('/register', join)`; remove step 1 or the redirect. |
| L8 | `web/src/app/goals/[id]/page.tsx:35-38` | When the state is `late`, the "Check in" button is disabled, so an in-progress check-in cannot be resumed during the 10-minute grace window unless the user stays on the check-in page. | Enable "Resume" when `useActiveCheckin` returns a check-in that started before the deadline. |
| L9 | `web/src/app/api/ai/verify-photo/route.ts:33`, `lib/ai/verdict.ts:3-7` | The vision prompt does not require English for `reason`/`roast`, and the user-written goal title (40 chars) is put straight into the prompt (injection). | Add "Reply in English", and pass the title as quoted JSON with an instruction to ignore instructions inside it. |
| L10 | `web/src/app/api/bridge/poke/route.ts:14` | `new URL(origin)` throws on a malformed Origin, which returns an unhandled 500. Unauthenticated drains are bounded by 2.5 s per instance. | Reuse `foreignOrigin()`. |
| L11 | `spacetimedb/src/shared/types.ts`, `mappers.ts` | The generated copies are stale against web: charity fields, `AiBotInput`, error codes. Harmless today. | Run `node scripts/sync-shared.mjs`, and add a CI drift check. |
| L12 | `web/src/data/logic.ts:205` | An invalid deadline returns `invalid_stay`, so the user sees a "Stay time must be 1-180 minutes" message. | Add an `invalid_deadline` code. |
| L13 | `spacetimedb/src/game.ts:422`, `live/hooks.ts:182` | The live cooldown follows the module's `demoMode` (on by default), so a production live build uses a 20 s cooldown. Mock follows `NEXT_PUBLIC_DEMO`. | One source of truth, defaulting to the real 24 h. |
| L14 | `spacetimedb/src/schema.ts:44-51,138-148` | The `user` and `withdrawal` tables are public, so any subscriber sees every user's balance and withdrawals. | Expose balances through `my_user` or squad-scoped views. |
| L15 | `spacetimedb/src/index.ts:170-173` | `claim_bridge`: the first caller wins. After a `--delete-data` republish, anyone can claim the bridge before `bridge-token.ts` runs. | Check against a module-owner identity, or claim it in `init`. |
| L16 | `web/src/data/mock/bot.ts:44` | The keyword bot uses the first number in the sentence: "set my 2nd goal penalty to 10" proposes $2. A confirmation is still required. | Use the number after "to", or the last number. |
| L17 | `web/src/data/live/stdb.ts:192-202` | `whenReady` leaves closures in `waiters` after a timeout. | Remove the waiter on timeout. |
| L18 | `web/src/components/voice/SpeakButton.tsx:31` | Tap target is 36 px, below 44 px. | Use `size-11`, or pad the hit area. |
| L19 | `web/src/data/mock/demoUsers.json` | Demo passwords ("Password1") ship in the client bundle. Intended for the demo, but the seeded mock hashes are 32-bit and kept in localStorage. | Make sure these credentials are never reused; keep this mock-only. |
| L20 | `web/next.config.ts` | No security headers (CSP, `frame-ancestors`, `Permissions-Policy` for camera, mic and geolocation). | Add `headers()`. |

### Nit

- ESLint warnings: unused state in `components/Cashout.tsx:27-28` (`newName`, `newAmt`), unused `mood` in `CheckinFlow.tsx:110`, `_id` in `data/live/index.ts:17`.
- `LocationPickerMap.tsx:27`: `dragging={!readOnly || true}` is always `true`.
- Unused: `useSquadOrNull` (`SquadParts.tsx:175`), the create-next-app SVGs in `web/public` (`file/globe/next/vercel/window.svg`, 0 references) and `PROMPT_FOR_SONNET.md` at the root.
- `contracts.md` names `signUp`/`signIn`/`signOut`, but the code exports `registerAccount`/`login`/`logout`.
- The UI imports `@/lib/ai/client` directly (`bot/page.tsx`, `CheckinFlow.tsx`, `CoachCard.tsx`), which breaks constitution rule 1 ("UI only talks to `@/data`").
- `data/index.ts:2-3` imports both `live` and `mock`, so the Spacetime SDK may ship in the mock bundle (unverified without a build).
- `data/mock/state.ts`: `STORAGE_KEY` stays `shamepool-mock-v1` while `MOCK_VERSION` is 5. Harmless, but confusing next to the spec text.
- `chat` route returns 503 before the origin and rate-limit guard, so it reveals whether the key is configured.

---

## 4. Contract and edge-case coverage (specs vs code)

**Specified but not handled, or handled differently:**
- **G6**: a 00:00 deadline cannot be satisfied (M2).
- **C17**: fail-open happens on every attempt, not once (H1).
- **C20/C18**: the grace window cannot be resumed from the goal screen (L8).
- **H2 / charity rule 2**: the clock can be reset by editing the goal (M6).
- **W6**: the stake is not kept during the grace window or before the tick (M1).
- **E9 / U7**: two tabs can lose updates (M3).
- **withdrawals.md auth flow**: `/onboarding` without identity should go to `/register?join=` (L7).
- **charity.md "Not built yet"**: everything charity-related is mock-only (H4).
- **P14**: there is no "pending" chip or penalty `status=failed` in live mode. Penalties are written `charged` immediately and Nessie runs asynchronously, so the outbox failure state never reaches the UI.

**Specified but not tested (no unit test found):**
- G6, C12 (stale >3 h), C17 "once", F4 (feed cap 200), F11 streak dedupe (only the pool milestone is tested), X5 (member joins mid-vote), X8 (empty merchant), X9 (non-member vote), H5, H11, W10-W12.
- U1-U13: there are no UI tests at all.
- E9 / store sync: `store.ts` has no tests.
- **The whole Spacetime module** (`game.ts`, `auth.ts`, `billing.ts`, `index.ts` reducers) has no tests.
- `stdb-bridge.ts` (drain, requeue, link resolution) has no tests.

**Mock/live parity gaps:**

| Feature | Mock | Live |
|---|---|---|
| AI photo check | Grok verdict (fail-open) | none: always accepted, `aiVerified=false` |
| AI Squad Bot | Grok + context | keyword bot only (`getBotContext` → null) |
| Charity | full | not built; /charity shows a skeleton forever |
| Demo gating | per-browser, harmless | global flags, unauthenticated (C1) |
| `claimSeedUser` | seed only, local | seed only, **no password, no demo check** |
| Cooldown source | `NEXT_PUBLIC_DEMO` | module `demoMode` (default on) |
| Location spoof gate | client `DEMO_ENABLED` | client `NEXT_PUBLIC_DEMO`; the server trusts any coordinates (inherent to client GPS) |

---

## 5. Verified correct

These were checked and found correct, so an area with no finding above means it was checked, not skipped.

- **Escalation**: `nextPenaltyCents` = `min(base*2^n, max(cap, base))`, with n clamped to 0..10 (P4, G5). Escalation runs in date order during catch-up (P9, tested).
- **Balance floor**: `applyPenalty` charges `min(balance, intended)` and records the shortfall. The fuzz never produced a negative balance or a negative pool (P2/P3).
- **Idempotency**:
  - The penalty map is keyed by `penaltyKey`, and the live `penalty.key` is unique. The fuzz produced 182/182 unique keys (P1).
  - `forceFlake` twice returns the same penalty.
  - `finishCheckin` on a completed check-in returns the same result (C19).
  - `confirmBotAction` twice gives `action_not_found` (F9).
  - `cancelWithdrawal` twice gives `withdrawal_not_found` (W5).
  - Outbox `enqueue` is idempotent per `ik`.
  - Nessie writes use find-then-create keyed by `[ik:…]`, and POSTs are never blindly retried.
- **Money conservation**: over 4,000 random steps, users + pools + donations + paid spends + escrowed/completed withdrawals stayed constant (P13, H10). Sign-up adds a $200 starting balance by design.
- **Integer cents**: every money input is checked with `Number.isInteger`. `dollarsToCents` rounds. The Nessie boundary converts cents to whole dollars, rounding half up with a $1 floor, and rejects 0, negative and fractional amounts, as documented.
- **Cash-out**: a strict majority of current members is required. The latest vote wins. The pool is re-checked at approval (X6). The proposer can cancel. A donation vote uses the same path. The UI's `need = floor(n/2)+1` matches the engine.
- **Withdrawals**: the money moves to escrow at request time. One pending withdrawal at a time. Minimum $5. It settles after the cooldown and on the next load (W8). It never touches the pool.
- **Scheduler**:
  - Catches up at most 7 days back.
  - Never charges retroactively before goal creation (G10/G11).
  - Waits for the grace window when a check-in is in progress (C20).
  - Skips dates already completed.
  - The live scheduler re-reads the goal row before each `applyFlake`, so the row is never stale.
- **Timezone / DST**: everything uses `squad.timezone` and wall-clock minutes (T1/T2, tested). `dateAddDays` uses UTC date math (no DST drift).
- **AI safety**:
  - The penalty tool is gated on the server (`looksLikePenaltyRequest`), and the engine validates it again: own active goal only, $1 to cap.
  - The model can never move money.
  - Context is capped at 9 KB and history at 6 turns of 300 characters. Markdown is stripped.
  - Malformed model output gives 502 and the keyword bot takes over.
  - English is required in the chat and coach prompts (tested).
  - Low-confidence "yes" answers become a rejection.
- **Secrets**:
  - Keys are read only in server routes and `server/`. `client-isolation.test.ts` enforces the Nessie key isolation.
  - The only public env vars are `NEXT_PUBLIC_DATA_MODE/DEMO/STDB_URI/STDB_DB`.
  - Errors from xAI, ElevenLabs and Nessie never include keys; Nessie messages are redacted.
  - Scripts never print values.
  - `.gitignore` covers `.env*` and `.vercel`.
  - No key-like strings were found in source, docs or the probe output.
- **Bridge**:
  - `/api/bridge/tick` compares the secret with `timingSafeEqual`.
  - `outbox_done/fail/requeue` and `set_demo_mode` require the bridge identity.
  - The `bridge_outbox` and `bridge_links` views return nothing to other identities.
  - Drains are serialized per instance. Failed jobs back off exponentially up to 5 attempts.
- **Nessie honesty**: the pool balance is owned by Spacetime, and `poolBalanceCents` is deliberately left out because the sandbox never moves balances (DECISIONS.md, `handlers.ts:232`). A deposit mirror entry acts as the payee-side ledger.
- **XSS**: there is no `dangerouslySetInnerHTML`. User messages render as React text. `IconText` only swaps known glyphs.
- **Hydration**: the mock store starts with `hydrated:false`, so the server render shows loading states. Browser APIs are used in effects or behind guards. `useSyncExternalStore` uses stable snapshots. No selector or effect loops were found.
- **Service worker**: no fetch or caching handler, so there are no stale deploys. Scope is `/`. It is registered only when the user turns notifications on.
- **Voice**: same-origin and rate limits are in place. Text is sanitized and capped at 280 characters. Blob URL revocation is bounded (20 entries). The queue drops lines beyond 3. Autoplay blocks are reported ("Tap again"). The projector has an "Enable sound" unlock.
- **Reduced motion**: confetti is disabled under `prefers-reduced-motion`.

---

## 6. Prioritized fix list (top 10)

1. **H3**: make the seed demo-proof. Add one teammate goal due every day with a late deadline, or deadlines relative to `now`. Rehearse on the real day and hour.
2. **H2**: fix the stage topology (one browser, several windows) and write it into the demo script. Test that the projector window updates within 2 s.
3. **H1**: harden photo fail-open. 4xx means retake, fail open once at most. Confirm `XAI_API_KEY` and the model id on Vercel, and that the function timeout is at least 20 s. Keep "Next photo fails" ready for step 4.
4. **H5**: lock down the AI and voice routes. Require same-origin, use a shared rate limiter keyed on `x-vercel-forwarded-for`, and lower the ceilings.
5. **C1, M7, H4 (auth part)**: before any live use, put an admin or bridge check on demo reducers, default `demoMode=false`, allow `force_flake` on your own goals only, and gate `claimSeedUser`.
6. **M1**: keep today's exposure in the stake until it is handled, and add a test.
7. **M2**: handle a 00:00 deadline (treat as 1440 or reject), and add a G6 test.
8. **M3**: add a Web Locks mutex around `commit()`, and break `rev` ties.
9. **M4, L1, L3**: tighten the voice "yes" regex, render the wallet goal icon, and fix Kevin's "2/1" goal counter. These are quick, visible fixes.
10. **M5, M8**: align the prize, README and env docs (Grok vs Gemini, `XAI_API_KEY`), and get the module and docs into the repository.

---

## 7. Unverified / could not check

- Whether the Spacetime module is **published** at maincloud `shamepool-mvp`, with which data, and whether `demoMode` is true there. Whether the bridge is already claimed. This decides how urgent C1 is.
- **Vercel production env**: values of `NEXT_PUBLIC_DATA_MODE` and `NEXT_PUBLIC_DEMO`, and whether `XAI_API_KEY` and `ELEVENLABS_API_KEY` are set. The function `maxDuration` limit for the vision call (up to 15 s). Whether Vercel overwrites a client-supplied `X-Forwarded-For`.
- Whether the xAI model id `grok-4.20-0309-non-reasoning` (`lib/server/xai.ts:11`) exists and accepts `image_url` with `detail:'low'`.
- Whether the Spacetime JS runtime supports `Intl.DateTimeFormat` with `timeZone: 'America/Detroit'` (used by `localDate`/`localMinutes` in every procedure). If not, the core live actions fail.
- Whether the generated bindings (`web/src/data/live/bindings`) match the module **currently published**. Both type-check against the local module.
- Which files git tracks: git commands were not allowed. Only `web/.git` exists locally, with no remote configured.
- `next build` output, bundle contents and size (for example whether the Spacetime SDK ships in mock mode). Not run, per the charter.
- Real-device behavior: iOS Safari autoplay and microphone, `capture="environment"` with HEIC, GPS accuracy indoors, 375 px layout rendering, screen-reader passes, Lighthouse. No browser was driven during this audit.
- ElevenLabs and xAI credit balances and their provider-side rate limits.
