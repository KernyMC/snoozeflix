# Voice and notifications (ElevenLabs)

- **Server route:** `POST /api/voice/speak` `{ text }` returns `audio/mpeg`. The key (`ELEVENLABS_API_KEY`, optional `ELEVENLABS_VOICE_ID`, default premade "Sarah") stays server-side in `web/.env.local`. Model `eleven_flash_v2_5` (fast, cheap). Text is sanitized (`src/lib/speech.ts`: no emojis/links/@mentions, "$10" read as "10 dollars", max 280 chars), same-origin only, 20 requests/min per IP, 60-line server cache so repeated roasts cost no extra credits.
- **Client:** `src/lib/voice.ts` (prefs in `localStorage["shamepool-prefs"]`, one voice at a time, small queue), `SpeakButton` on bot messages (bot page and feed), `Alerts` mounted in `Providers`.
- **Auto-speak:** Settings > "Benny the Penny speaks" reads every new Squad Bot feed line aloud. On the projector (`/squad?tv=1`) the "Enable sound" button unlocks audio for the room (browsers block autoplay until a tap).
- **Notifications:** Settings > "Notifications" asks permission, registers `public/sw.js` and shows OS notifications for new squad activity when the tab is in the background, plus a **deadline reminder 30 minutes before** each goal (once per goal per day, also spoken if voice is on). Demo tip: DemoPanel > "Skip to 1 min before deadline" triggers it.
- **Limits (MVP):** notifications work while the app is open in a tab (or installed PWA in the background on Android). True push (app closed) needs a push server key (VAPID) and a worker that stores subscriptions: not built.
- **Not built:** phone-call roasts (needs a telephony provider).

## Talk to Benny the Penny (voice chat) and sound effects
- **Voice chat:** `/bot` has a mic button (tap to talk, tap again to send, 10 s max). Audio goes to `POST /api/voice/transcribe` (ElevenLabs Scribe), the text goes through the normal `askBot` contract, and the answer is spoken back. While a bot action is waiting, saying "yes" or "confirm" confirms it. Needs https (or localhost) and microphone permission.
- **Smarter bot:** also answers balance, who is winning, what is due today, and greetings/help.
- **Sound effects:** `scripts/generate-sfx.mjs` creates `web/public/sfx/{flake,success,cash,nudge}.mp3` once (ElevenLabs Sound Effects, ~60 KB total); they ship as static files, so they cost no credits at runtime. Played on: your flake, a successful check-in, a withdrawal or cash-out, and deadline reminders. Toggle in Settings > Sound effects.
- **Abuse guards on both voice routes:** same-origin only, per-IP rate limit, plus a global hourly budget per instance (400 speech / 300 transcriptions).
- **Env:** `ELEVENLABS_API_KEY` (set on Vercel as a secret; the server trims stray whitespace).
