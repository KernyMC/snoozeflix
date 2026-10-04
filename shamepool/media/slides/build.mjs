// Renders slides.html to PNGs (one per slide), a PDF, and a PowerPoint file with speaker notes.
import { chromium } from 'playwright';
import PptxGenJS from 'pptxgenjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const NOTES = [
  '[0:00 - 0:12] Hi judges, we are ShamePool: skip the task, lose the cash. It is behavioral finance for friends, built for the FinTech track, with AI doing real work inside.',
  '[0:12 - 0:30] Everyone has a resolution they dropped. Why? Quitting is free, nobody is watching, and there is no proof you ever showed up. Willpower alone does not scale, so we change the incentives instead of asking for more discipline.',
  '[0:30 - 0:58] Here is the loop. You commit to a goal with a place, a deadline and a penalty, and an AI coach plans it from one sentence. To check in you must be there: GPS, a minimum stay, and a photo that Grok\'s vision model verifies. If you flake, the penalty is charged automatically, doubles each time, and lands in a shared squad pool. Then the squad votes to spend it together, or it goes to charity. Nobody wins anyone else\'s money, so it is not gambling.',
  '[0:58 - 1:18] Everything you see is the live app, not mockups. The coach fills the form from one sentence. A couch photo gets rejected with a roast. A flake is charged instantly and shows up for everyone. And a full pool that nobody spends is donated automatically.',
  '[1:18 - 1:38] Fairness is built in. The pool is never paid out as cash. A locked stake covers your worst case, so nobody can flake and run. Withdrawals have a cooling period, penalties are capped, and balances never go negative. We wrote every rule down and tested it.',
  '[1:38 - 2:03] The AI does real work. Squad Bot answers with your actual data, and when it proposes a penalty change, our engine validates it and you confirm. Vision checks every photo. The coach plans goals. ElevenLabs gives Benny the Penny a voice you can talk to, and Photon Spectrum puts the same bot on iMessage.',
  '[2:03 - 2:23] Under the hood: Spacetime holds the live state, Capital One Nessie records every penalty as a transfer, and everything sits behind one data contract, with two hundred seventy three tests and an independent AI audit. If the wifi dies, a mock backend runs the same contract.',
  '[2:23 - 2:43] How we make money: merchants pay when a squad cashes out, ShamePool Plus unlocks more goals and bigger squads, and gyms and campuses run team challenges. We never take a cut of your failure, and we grow from friends to campuses to teams.',
  '[2:43 - 3:00] Try it right now: scan the code, sign in as kevin, and flake. ShamePool: skip the task, lose the cash. Thank you.',
];

mkdirSync('out', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(resolve('slides.html')).href, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(800);

const slides = await page.$$('section.slide');
console.log('slides:', slides.length);
const files = [];
for (let i = 0; i < slides.length; i++) {
  const f = `out/slide-${String(i + 1).padStart(2, '0')}.png`;
  await slides[i].screenshot({ path: f });
  files.push(f);
}
await page.pdf({ path: 'out/ShamePool-Pitch.pdf', width: '1920px', height: '1080px', printBackground: true, preferCSSPageSize: true });
await browser.close();

const pptx = new PptxGenJS();
pptx.layout = 'LAYOUT_16x9';
pptx.title = 'ShamePool pitch';
files.forEach((f, i) => {
  const s = pptx.addSlide();
  s.addImage({ path: f, x: 0, y: 0, w: 10, h: 5.625 });
  s.addNotes(NOTES[i] ?? '');
});
await pptx.writeFile({ fileName: 'out/ShamePool-Pitch.pptx' });
writeFileSync('out/speaker-notes.txt', NOTES.map((n, i) => `SLIDE ${i + 1}\n${n}\n`).join('\n'));
const words = NOTES.join(' ').split(/\s+/).length;
console.log(`done. notes: ${words} words ≈ ${(words / 150).toFixed(1)} min at 150 wpm`);
