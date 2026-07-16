import { chromium } from '@playwright/test';

const loginRes = await fetch('http://localhost:3000/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'devtest@vp.local', password: 'dev123' }),
});
const setCookie = loginRes.headers.get('set-cookie');
const [name, value] = setCookie.split(';')[0].split('=');

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await context.addCookies([{ name, value, domain: 'localhost', path: '/' }]);

const page = await context.newPage();
await page.goto('http://localhost:3000/topics', { waitUntil: 'load', timeout: 20000 });
await page.waitForTimeout(3000);
await page.screenshot({ path: '/tmp/vp-screenshots/04-topics.png' });
console.log('✓ topics page');

await browser.close();
