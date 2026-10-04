// Drives the REAL deployed app (https://shamepool.vercel.app) and saves 2x phone screenshots for the demo video.
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';

const BASE = process.env.BASE ?? 'https://shamepool.vercel.app';
const W = 430, H = 932;
mkdirSync('shots', { recursive: true });
const manifest = [];
let lastTap = null;

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const HIDE = '[aria-label="Open demo controls"] { visibility: hidden !important; }';
const newCtx = (extra = {}) => browser.newContext({
  viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  locale: 'en-US', timezoneId: 'America/Detroit', ...extra,
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function shot(page, name, { wait = 700, full = false, note = '' } = {}) {
  await sleep(wait);
  await page.screenshot({ path: `shots/${name}.png`, fullPage: full });
  manifest.push({ name, tap: lastTap, note });
  lastTap = null;
  console.log('  shot', name);
}
async function tap(page, locator) {
  await locator.first().waitFor({ state: 'visible', timeout: 15000 });
  const bb = await locator.first().boundingBox();
  if (bb) lastTap = { x: (bb.x + bb.width / 2) / W, y: (bb.y + bb.height / 2) / H };
  await locator.first().click();
}
async function step(label, fn) {
  try { await fn(); } catch (e) { console.log(`  !! ${label}: ${String(e.message).split('\n')[0]}`); }
}

async function loginAs(page, user) {
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  if (!/\/$/.test(new URL(page.url()).pathname === '/' ? '/' : '')) { /* already routed */ }
  await page.getByPlaceholder('Enter your username').fill(user);
  await page.getByPlaceholder('Enter your password').fill('Password1');
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await page.waitForURL(/\/(home|onboarding)/, { timeout: 15000 });
  await sleep(900);
}
async function logout(page) {
  await page.goto(BASE + '/settings', { waitUntil: 'networkidle' });
  await sleep(500);
  await page.getByRole('button', { name: /sign out/i }).last().click();
  await page.waitForURL(BASE + '/', { timeout: 10000 }).catch(() => {});
  await sleep(600);
}
async function openDemo(page) {
  // the wrench is hidden in screenshots (CSS below); click it programmatically
  await page.locator('button[aria-label="Open demo controls"]').evaluate((el) => el.click());
  await sleep(400);
}
async function flakeNow(page) {
  await openDemo(page);
  await page.getByRole('button', { name: /Flake now/ }).click();
  await page.getByRole('button', { name: 'Ouch' }).waitFor({ timeout: 8000 }).catch(() => {});
}

// ============================ SESSION A: Kevin, the full check-in story ============================
console.log('SESSION A');
{
  const ctx = await newCtx();
  await ctx.addInitScript((css) => { const add = () => { const s = document.createElement('style'); s.textContent = css; document.documentElement.appendChild(s); }; if (document.documentElement) add(); else document.addEventListener('DOMContentLoaded', add); }, HIDE);
  const page = await ctx.newPage();
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await shot(page, 'a01_login');
  await page.getByPlaceholder('Enter your username').fill('kevin');
  await page.getByPlaceholder('Enter your password').fill('Password1');
  await shot(page, 'a02_filled', { wait: 300 });
  await tap(page, page.getByRole('button', { name: /^sign in$/i }));
  await page.waitForURL(/\/home/, { timeout: 15000 });
  await shot(page, 'a03_home', { wait: 1200 });

  // upgrade Kevin to the paid plan so the coach (hidden at the free limit) is available
  await page.evaluate(() => {
    const k = 'shamepool-mock-v1';
    const s = JSON.parse(localStorage.getItem(k));
    s.billing = s.billing || {};
    s.billing.seed_kevin = { ...(s.billing.seed_kevin || { addresses: [], payments: [] }), tier: 'paid' };
    s.rev = (s.rev || 0) + 1;
    localStorage.setItem(k, JSON.stringify(s));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(800);

  let goalHref = null;
  await step('open goal', async () => {
    const card = page.locator('a[href^="/goals/"]').first();
    goalHref = await card.getAttribute('href');
    await tap(page, card);
    await page.waitForURL(/\/goals\//);
    await shot(page, 'a04_goal', { wait: 900 });
  });

  await step('coach', async () => {
    await page.goto(BASE + '/goals/new', { waitUntil: 'networkidle' });
    await sleep(900);
    await page.getByLabel('Describe your goal').fill('I want to hit the gym after class on weekdays, I usually flake on mornings');
    await shot(page, 'a05_coach_typed', { wait: 300 });
    await tap(page, page.getByRole('button', { name: /Fill it in for me/i }));
    await page.getByText(/Filled in/i).waitFor({ timeout: 20000 }).catch(() => {});
    await sleep(900);
    await shot(page, 'a06_coach_filled', { wait: 600 });
    await page.evaluate(() => window.scrollBy(0, 760));
    await shot(page, 'a07_form', { wait: 600 });
    await page.evaluate(() => window.scrollBy(0, 900));
    await shot(page, 'a08_form_penalty', { wait: 600 });
  });

  const checkinUrl = goalHref ? `${BASE}${goalHref}/checkin` : null;
  await step('geo error', async () => {
    await page.goto(BASE + goalHref, { waitUntil: 'networkidle' });
    await sleep(600);
    await tap(page, page.getByRole('link', { name: /^check in$/i }).or(page.getByRole('button', { name: /^check in$/i })));
    await page.waitForURL(/checkin/);
    await shot(page, 'a09_cant_see_you', { wait: 1500 });
  });

  await step('demo panel + fake location', async () => {
    await page.goto(BASE + goalHref, { waitUntil: 'networkidle' });
    await sleep(500);
    await openDemo(page);
    await shot(page, 'a10_demo_panel', { wait: 400 });
    await tap(page, page.getByRole('button', { name: /Pretend I.m there/ }));
    await sleep(900);
  });

  await step('stay timer', async () => {
    await page.goto(checkinUrl, { waitUntil: 'networkidle' });
    await shot(page, 'a11_stay', { wait: 4000 });
    await page.getByRole('button', { name: /^continue$/i }).waitFor({ state: 'visible', timeout: 90000 });
    await page.waitForFunction(() => { const b = [...document.querySelectorAll('button')].find((x) => /continue/i.test(x.textContent)); return b && !b.disabled; }, null, { timeout: 90000 });
    await shot(page, 'a12_stay_done', { wait: 500 });
    await tap(page, page.getByRole('button', { name: /^continue$/i }));
    await shot(page, 'a13_photo_step', { wait: 800 });
  });

  await step('couch photo', async () => {
    await page.locator('input[type=file]').setInputFiles('assets/couch.jpg');
    await sleep(1200);
    await shot(page, 'a14_couch_preview', { wait: 400 });
    await tap(page, page.getByRole('button', { name: /^submit$/i }));
    await shot(page, 'a15_verifying', { wait: 600 });
    await page.getByText(/Not quite/i).waitFor({ timeout: 30000 });
    await shot(page, 'a16_rejected', { wait: 900 });
    await tap(page, page.getByRole('button', { name: /try again/i }));
    await sleep(800);
  });

  await step('gym photo', async () => {
    await page.locator('input[type=file]').setInputFiles('assets/gym.jpg');
    await sleep(1200);
    await shot(page, 'a17_gym_preview', { wait: 400 });
    await tap(page, page.getByRole('button', { name: /^submit$/i }));
    await page.getByText(/Nailed it/i).waitFor({ timeout: 30000 });
    await shot(page, 'a18_success', { wait: 450 });
    await shot(page, 'a19_success_settled', { wait: 1500 });
  });
  await ctx.close();
}

// ============================ SESSION B: flakes, pool, charity, wallet, bot, projector ============================
console.log('SESSION B');
{
  const ctx = await newCtx();
  await ctx.addInitScript((css) => { const add = () => { const s = document.createElement('style'); s.textContent = css; document.documentElement.appendChild(s); }; if (document.documentElement) add(); else document.addEventListener('DOMContentLoaded', add); }, HIDE);
  const page = await ctx.newPage();
  await loginAs(page, 'kevin');

  await step('kevin flakes', async () => {
    await shot(page, 'b01_home', { wait: 600 });
    await openDemo(page);
    await page.getByRole('button', { name: /Flake now/ }).click();
    await page.getByRole('button', { name: 'Ouch' }).waitFor({ timeout: 10000 });
    await shot(page, 'b02_flake_modal', { wait: 900 });
    await page.getByRole('button', { name: 'Ouch' }).click();
    await sleep(500);
    await page.goto(BASE + '/squad', { waitUntil: 'networkidle' });
    await shot(page, 'b03_squad', { wait: 1200 });
    await page.evaluate(() => window.scrollBy(0, 700));
    await shot(page, 'b04_squad_feed', { wait: 600 });
  });

  for (const u of ['ana', 'leo', 'maya']) {
    await step(`${u} flakes`, async () => {
      await logout(page);
      await loginAs(page, u);
      await flakeNow(page);
      await page.getByRole('button', { name: 'Ouch' }).click().catch(() => {});
      await sleep(600);
    });
  }

  await step('pool full + charity', async () => {
    await page.goto(BASE + '/squad', { waitUntil: 'networkidle' });
    await shot(page, 'b05_pool_full', { wait: 1500 });
    await page.goto(BASE + '/charity', { waitUntil: 'networkidle' });
    await shot(page, 'b06_charity_clock', { wait: 1500 });
    await page.evaluate(() => window.scrollBy(0, 700));
    await shot(page, 'b07_charity_picker', { wait: 600 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await openDemo(page);
    await page.getByRole('button', { name: /Skip pool deadline/ }).click();
    await sleep(1500);
    await page.goto(BASE + '/charity', { waitUntil: 'networkidle' });
    await sleep(800);
    await page.evaluate(() => window.scrollBy(0, 1400));
    await shot(page, 'b08_donated', { wait: 800 });
    await page.goto(BASE + '/squad', { waitUntil: 'networkidle' });
    await page.evaluate(() => window.scrollBy(0, 650));
    await shot(page, 'b09_feed_donation', { wait: 900 });
  });

  await step('wallet', async () => {
    await logout(page);
    await loginAs(page, 'kevin');
    await page.goto(BASE + '/wallet', { waitUntil: 'networkidle' });
    await shot(page, 'b10_wallet', { wait: 1200 });
    await tap(page, page.getByRole('button', { name: /^withdraw$/i }));
    await sleep(500);
    await page.getByLabel(/Amount/i).fill('40');
    await shot(page, 'b11_withdraw_sheet', { wait: 500 });
    await tap(page, page.getByRole('button', { name: /confirm withdrawal/i }));
    await sleep(1800);
    await shot(page, 'b12_withdraw_pending', { wait: 800 });
  });

  await step('bot', async () => {
    await page.goto(BASE + '/bot', { waitUntil: 'networkidle' });
    await shot(page, 'b13_bot', { wait: 900 });
    await tap(page, page.getByRole('button', { name: /who.s flaking/i }));
    await page.waitForFunction(() => document.body.innerText.includes('flake') && !document.body.innerText.includes('•••'), null, { timeout: 25000 }).catch(() => {});
    await sleep(2500);
    await shot(page, 'b14_bot_answer', { wait: 700 });
    await page.getByPlaceholder(/Type or tap the mic/i).fill('make my gym penalty twelve bucks');
    await page.getByRole('button', { name: /^send$/i }).click();
    await sleep(6000);
    await shot(page, 'b15_bot_confirm', { wait: 700 });
  });

  await step('settings voice', async () => {
    await page.goto(BASE + '/settings', { waitUntil: 'networkidle' });
    await sleep(700);
    const card = page.getByLabel('Voice and notifications');
    await card.scrollIntoViewIfNeeded();
    await shot(page, 'b16_voice_settings', { wait: 600 });
  });

  await step('projector', async () => {
    const tv = await ctx.newPage();
    await tv.setViewportSize({ width: 1440, height: 810 });
    await tv.goto(BASE + '/squad?tv=1', { waitUntil: 'networkidle' });
    await sleep(2500);
    await tv.screenshot({ path: 'shots/b17_projector.png' });
    manifest.push({ name: 'b17_projector', tap: null, note: 'landscape 1440x810' });
    console.log('  shot b17_projector');
  });
  await ctx.close();
}

writeFileSync('shots/manifest.json', JSON.stringify(manifest, null, 2));
await browser.close();
console.log('done:', manifest.length, 'shots');
