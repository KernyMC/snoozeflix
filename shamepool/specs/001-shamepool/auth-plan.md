# Login, Register & Forgot Password (ShamePool, mock backend)

## Context
ShamePool (`shamepool/web`, Next.js 15 App Router, Tailwind v4, mock data layer) has no auth. Identity is just a `userId` in `sessionStorage`. The user wants mobile-first login, registration and forgot-password pages, with all front-end validation, as the first screen. Backend comes later, so everything goes through the existing mock data facade. Style follows ShamePool (indigo/cream, Nunito, chunky buttons), with Benny (`Flakey` component) and the existing copy voice. Layout and flow come from the screenshots.

## Decisions (confirmed)
- ShamePool style, not the screenshots' blue/orange.
- Register -> existing `/onboarding` (avatar, squad). Username is the display name.
- Demo seed-user picker stays on login, only when `NEXT_PUBLIC_DEMO=true`.

## Palette (matches existing `@theme` tokens in `globals.css`, no new colors)
Deep Indigo `#24215B` (primary button, headings), Warm Gold `#F6C445` (the "pool" in the wordmark only), Muted Aqua `#75BFBC` (focus ring, active step pill, password strength accent), Soft Cream `#FAF7EE` (page background), White `#FFF` (form cards), Slate Gray `#666779` (secondary text, subtitles), Light Border `#E5E2D9` (input and card borders, dividers), Success Green `#287A58` (strength "strong", reset success), Alert Red `#B83D49` (field errors, wrong-credentials message). Use the Tailwind token classes (`bg-primary`, `text-ink-soft`, `border-surface-line`, `text-ember-dark`, etc.), never hard-coded hex. Per the screenshots-vs-style decision, "Forgot password?" and "Create account" are secondary/ghost buttons, not red/orange.

## Routes (all `'use client'`, `mx-auto max-w-md min-h-dvh px-5 py-8`)
- `web/src/app/page.tsx` (`/`): becomes the login page. If `useMe()` is a user, redirect to `/home` or `/onboarding` by `squadId`. This keeps `useGate`'s redirect to `/` as the login screen. Contents: Benny (`cheer`, 150), `Wordmark`, tagline, Username and Password fields (show/hide toggle), "Sign in" (primary), "Forgot password?" (ghost link), "Create an account" (secondary). Demo picker below, demo mode only.
- `web/src/app/register/page.tsx`: first name, last name, email, username, password (with strength bar, as in screenshot 1), confirm password, then 3 security-question cards (select + answer, as in screenshot 2). Each select hides questions already chosen in the other cards. "Create account" and "Back" buttons. On success, go to `/onboarding`.
- `web/src/app/forgot-password/page.tsx`: 3-step flow reusing the `/onboarding` step-indicator pills, with labels Find account / Verify / New password. Step 1 username. Step 2 shows the user's 3 questions and takes 3 answers. Step 3 takes the new password and confirm. Success shows a toast and goes to `/` with Benny `cheer`.

## Shared UI
- `web/src/components/auth/AuthShell.tsx`: shared page wrapper (Benny, heading, subtitle, step slot). Cuts duplication across the 3 pages.
- `web/src/components/auth/PasswordField.tsx`: wraps `Field` and `inputCls` from `ui/Field.tsx` with a show/hide button (44px target, `aria-label`), plus an optional `PasswordStrength` bar.
- Reuse `Button` (`full`, `loading`, `href`), `Field`, `Card`, `useToast`, `Flakey`, `Wordmark` as they are. Mobile details: `inputMode`, `autoComplete` (`username`, `current-password`, `new-password`, `email`), `enterKeyHint`, 16px+ input text to avoid iOS zoom, `pb-[env(safe-area-inset-bottom)]`.

## Validation (pure, testable)
`web/src/data/authLogic.ts`, following the `validateName` pattern in `data/logic.ts`. Each function returns `ErrorCode | null`.
- Names: required, 1-30 chars, letters/spaces/hyphens/apostrophes.
- Email: trimmed, regex, max 254.
- Username: 3-20 chars, `[a-z0-9_]`, case-insensitive uniqueness (checked in the engine).
- Password: >=8 chars, at least one letter and one number. `passwordStrength()` returns 0-4 for the bar.
- Confirm must match.
- Security questions: the 3 chosen questions are distinct, answers are 2-50 chars, normalised (trim, lowercase, collapse spaces) before compare. Question list is the 8 from screenshot 2 (`SECURITY_QUESTIONS` constant).
Pages validate on blur and on submit, show `Field error`, and focus the first invalid field. The submit button shows `loading` and is disabled while busy. Inline form-level errors (such as bad credentials) use an `role="alert"` message plus Benny `worried`.

## Data layer (mock; same three-place pattern)
- `data/types.ts`: add `Credentials`-related types (`Account { userId, username, email, firstName, lastName, passwordHash, securityQa: {qId, answerHash}[3] }`) and new `ErrorCode`s: `invalid_credentials`, `username_taken`, `email_taken`, `invalid_email`, `invalid_username`, `weak_password`, `password_mismatch`, `invalid_security`, `wrong_answers`, `account_not_found`, `too_many_attempts`. Add copy for each to `ERROR_COPY` in `ui/States.tsx`.
- `data/mock/state.ts`: add `accounts: Record<userId, Account>`, bump `MOCK_VERSION` to 2. Seed users get demo accounts (e.g. username = seed name, password `password1`) so login works for them.
- `data/mock/engine.ts` (pure, takes `Ctx`): `registerAccount`, `login`, `getSecurityQuestions(username)`, `verifySecurityAnswers`, `resetPassword`. Mock hashing is a simple deterministic hash (`hashStr`) and is marked as mock-only. Login does not reveal whether the username or the password was wrong. Reset needs a `resetToken` issued by a successful verify. Throttle: after 5 failed attempts on login or verify, return `too_many_attempts` for 30s (stored in mock state).
- `data/mock/actions.ts`: async wrappers via `run()` (so latency and `?mockError` simulation work). `registerAccount` and `login` call `setIdentity`. Add `logout()` that calls `setIdentity(null)`.
- `data/live/index.ts`: rejecting stubs. `data/index.ts`: export all new actions.
- `registerUser` (existing onboarding) stays for the demo and "Get started" flows. Onboarding is adjusted to skip the name step when the user already has an account (name = username).

## Other edits
- `Settings` page: add "Sign out" button (calls `logout()`, then `/`). Without it a signed-in tab has no way back to login.
- `TopBar`/"Switch user": point to logout.
- `useGate`: unchanged (`/` is now login).
- Specs: add short `## Auth` section to `shamepool/specs/001-shamepool/` (`contracts.md`, `ui-spec.md`, `edge-cases.md`), and change "Out of scope: real auth" to "real backend auth".

## Tests (vitest, node env, pure only)
- `data/authLogic.test.ts`: each validator's accept and reject cases, strength levels.
- `data/mock/engine.test.ts`: register (success, duplicate username/email, mismatched pw), login (success, wrong pw, unknown user returns the same error), security question retrieval, verify (right and wrong, case and whitespace insensitive), reset (valid token, invalid token), lockout.

## Verification
1. `cd shamepool/web && npm run test && npm run lint && npm run build`.
2. `npm run dev`, view at 375px width (devtools device mode):
   - `/` shows login first. Empty submit shows field errors. Wrong password shows the generic error. Valid login goes to `/home`.
   - `/register`: every validation fires, the select de-dupes questions, success goes to `/onboarding`, then squad, then `/home`.
   - `/forgot-password`: wrong answers rejected, correct answers go to new password, then log in with the new password.
   - Reload while signed in keeps the session (same tab). Sign out returns to `/`. Visiting `/home` signed out redirects to `/`.
   - `?mockSlow=1` shows loading states, `?mockError=1` shows error handling. Keyboard-only and no horizontal scroll at 375px.
