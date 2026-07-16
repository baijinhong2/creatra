import { chromium } from '@playwright/test';

const loginRes = await fetch('http://localhost:3000/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'devtest@vp.local', password: 'dev123' }),
});
const [name, value] = loginRes.headers.get('set-cookie').split(';')[0].split('=');

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await context.addCookies([{ name, value, domain: 'localhost', path: '/' }]);

const page = await context.newPage();
await page.goto('http://localhost:3000/onboarding/path-a/handle', { waitUntil: 'load' });
await page.waitForTimeout(800);
await page.screenshot({ path: '/tmp/vp-screenshots/v071-04-pathA-handle.png' });
console.log('✓ handle page');
await browser.close();
