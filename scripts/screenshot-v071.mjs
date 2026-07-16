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

const pages = [
  ['/onboarding', '/tmp/vp-screenshots/v071-01-entry.png'],
  ['/onboarding/template', '/tmp/vp-screenshots/v071-02-template.png'],
  ['/onboarding/path-a', '/tmp/vp-screenshots/v071-03-pathA.png'],
  ['/onboarding/path-a/handle', '/tmp/vp-screenshots/v071-04-pathA-handle.png'],
  ['/onboarding/path-a/paste', '/tmp/vp-screenshots/v071-05-pathA-paste.png'],
  ['/onboarding/path-b', '/tmp/vp-screenshots/v071-06-pathB.png'],
  ['/onboarding/path-c', '/tmp/vp-screenshots/v071-07-pathC-q1.png'],
];

for (const [url, out] of pages) {
  const page = await context.newPage();
  try {
    await page.goto(`http://localhost:3000${url}`, { waitUntil: 'load', timeout: 15000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: out, fullPage: false });
    console.log(`✓ ${url}`);
  } catch (e) {
    console.log(`✗ ${url}: ${e.message.slice(0, 60)}`);
  }
  await page.close();
}

// Q2-Q6 flow
const page = await context.newPage();
await page.goto('http://localhost:3000/onboarding/path-c', { waitUntil: 'load' });
await page.waitForTimeout(1000);
// Q1: select 2 + free text
await page.click('text=独立开发');
await page.click('text=工程师');
await page.fill('input[placeholder*="前端工程师"]', '前端工程师,做独立 SaaS');
await page.waitForTimeout(500);
await page.click('text=下一步');
await page.waitForTimeout(800);
await page.screenshot({ path: '/tmp/vp-screenshots/v071-08-pathC-q2.png' });
// Q2
await page.click('text=技术细节');
await page.click('text=产品复盘');
await page.fill('input[placeholder*="AI agent"]', 'AI agent、RAG 实践');
await page.click('text=下一步');
await page.waitForTimeout(500);
await page.click('text=影响力');
await page.fill('input[placeholder*="技术人脉"]', '积累人脉');
await page.click('text=下一步');
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/vp-screenshots/v071-09-pathC-q4.png' });

await browser.close();
console.log('Done');
