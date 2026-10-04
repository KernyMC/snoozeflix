/** Pure helpers for text-to-speech. Shared by the API route and the client. */
export const MAX_SPEECH_CHARS = 280;

const PICTO = /[\p{Extended_Pictographic}️‍]/gu;
const URL_RE = /https?:\/\/\S+/g;

/** Make bot text safe and pleasant to read aloud. Returns '' when there is nothing speakable. */
export function sanitizeSpeech(input: unknown): string {
  if (typeof input !== 'string') return '';
  let t = input
    .replace(URL_RE, ' ')
    .replace(/@squadbot/gi, ' ')
    .replace(PICTO, ' ')
    .replace(/[*_`#>~|\\]/g, ' ')
    .replace(/\$(\d+(?:\.\d{1,2})?)/g, (_, n: string) => `${n} dollars`)
    .replace(/\s+/g, ' ')
    .trim();
  if (!/[\p{L}\p{N}]/u.test(t)) return '';
  if (t.length > MAX_SPEECH_CHARS) {
    const cut = t.slice(0, MAX_SPEECH_CHARS);
    const sp = cut.lastIndexOf(' ');
    t = (sp > 120 ? cut.slice(0, sp) : cut).trim();
  }
  return t;
}
