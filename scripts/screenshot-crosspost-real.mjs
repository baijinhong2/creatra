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

// Click a starter card to send a message
await page.click('text=今天发什么');
await page.waitForTimeout(20000);  // wait for full agent response

// Now click 跨平台
try {
  const button = await page.locator('text=跨平台').first();
  await button.click();
  await page.waitForTimeout(15000);  // wait for 3 platform rewrites
  await page.screenshot({ path: '/tmp/vp-screenshots/15-crosspost-done.png' });
  console.log('✓ cross-post done with content');
} catch (e) {
  console.log('✗:', e.message);
  await page.screenshot({ path: '/tmp/vp-screenshots/15-crosspost-error.png' });
}

await browser.close();
