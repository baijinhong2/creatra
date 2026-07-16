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

const targets = [
  ['/onboarding/path-a', '/tmp/vp-screenshots/v071-final-01-pathA.png'],
  ['/inbox', '/tmp/vp-screenshots/v071-final-02-inbox.png'],
  ['/health', '/tmp/vp-screenshots/v071-final-03-health.png'],
];

for (const [url, out] of targets) {
  const page = await context.newPage();
  try {
    await page.goto(`http://localhost:3000${url}`, { waitUntil: 'load', timeout: 15000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: out });
    console.log(`✓ ${url}`);
  } catch (e) {
    console.log(`✗ ${url}: ${e.message.slice(0, 60)}`);
  }
  await page.close();
}

await browser.close();
