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
await page.goto('http://localhost:3000/', { waitUntil: 'load', timeout: 20000 });
await page.waitForTimeout(2000);

// Just click 跨平台 on existing message (the previous one we made)
try {
  await page.waitForSelector('text=跨平台', { timeout: 10000 });
  await page.click('text=跨平台', { timeout: 5000 });
  await page.waitForTimeout(15000);  // wait for 3 platform rewrites
  await page.screenshot({ path: '/tmp/vp-screenshots/14-crosspost-done.png' });
  console.log('✓ cross-post done');
} catch (e) {
  console.log('✗:', e.message);
  await page.screenshot({ path: '/tmp/vp-screenshots/14-crosspost-error.png' });
}

await browser.close();
