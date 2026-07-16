import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const TARGETS = [
  ['http://localhost:3000/login', '/tmp/vp-screenshots/00-login.png'],
  ['http://localhost:3000/onboarding', '/tmp/vp-screenshots/01-onboarding.png'],
  ['http://localhost:3000/onboarding/path-b/template', '/tmp/vp-screenshots/02-template.png'],
  ['http://localhost:3000/onboarding/path-c/quiz', '/tmp/vp-screenshots/03-quiz.png'],
  ['http://localhost:3000/topics', '/tmp/vp-screenshots/04-topics.png'],
  ['http://localhost:3000/health', '/tmp/vp-screenshots/05-health.png'],
];

mkdirSync('/tmp/vp-screenshots', { recursive: true });

// Login first to get session
const loginRes = await fetch('http://localhost:3000/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'devtest@vp.local', password: 'dev123' }),
});
const setCookie = loginRes.headers.get('set-cookie');
const sessionCookie = setCookie.split(';')[0].split('=');
console.log(`Got cookie: ${sessionCookie[0]}=${sessionCookie[1].slice(0, 20)}...`);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await context.addCookies([{
  name: sessionCookie[0],
  value: sessionCookie[1],
  domain: 'localhost',
  path: '/',
}]);

for (const [url, out] of TARGETS) {
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: out, fullPage: false });
    console.log(`✓ ${url} → ${out}`);
  } catch (e) {
    console.log(`✗ ${url} → ${e.message}`);
  }
  await page.close();
}

await browser.close();
console.log('Done');
