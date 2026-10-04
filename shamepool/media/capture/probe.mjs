import { chromium } from 'playwright';
const b = await chromium.launch({ channel: 'chrome', headless: true });
const c = await b.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const p = await c.newPage();
await p.goto('https://shamepool.vercel.app/', { waitUntil: 'networkidle' });
await p.screenshot({ path: 'shots/probe.png' });
console.log('title:', await p.title(), 'size ok');
await b.close();
