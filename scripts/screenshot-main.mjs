import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

mkdirSync('/tmp/vp-screenshots', { recursive: true });

const loginRes = await fetch('http://localhost:3000/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'devtest@vp.local', password: 'dev123' }),
});
const setCookie = loginRes.headers.get('set-cookie');
const [name, value] = setCookie.split(';')[0].split('=');

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await context.addCookies([{ name, value, domain: 'localhost', path: '/' }]);

const page = await context.newPage();
await page.goto('http://localhost:3000/', { waitUntil: 'networkidle', timeout: 20000 });
await page.waitForTimeout(2000);
await page.screenshot({ path: '/tmp/vp-screenshots/10-main-empty.png' });
console.log('✓ main page empty');

// Type a message and send
await page.fill('textarea', '用我的 voice DNA 写一条关于 Day 30 of building 的推文,简短');
await page.keyboard.press('Enter');
await page.waitForTimeout(8000);
await page.screenshot({ path: '/tmp/vp-screenshots/11-main-after-send.png' });
console.log('✓ main page after send');

// Open Inbox drawer
try {
  await page.click('text=互动');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/tmp/vp-screenshots/12-inbox-drawer.png' });
  console.log('✓ inbox drawer');
} catch (e) {
  console.log('✗ inbox:', e.message);
}

await browser.close();
console.log('Done');
