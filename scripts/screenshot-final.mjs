// Final acceptance screenshots — light + dark mode
import { chromium } from '@playwright/test';
import { mkdirSync } from 'fs';

const URL = 'http://localhost:3000';
const OUT = '/tmp/vp-audit/final';
mkdirSync(OUT, { recursive: true });

const PAGES = [
  { name: '01-onboarding',       url: '/onboarding' },
  { name: '02-path-a',           url: '/onboarding/path-a' },
  { name: '03-path-a-paste',     url: '/onboarding/path-a/paste' },
  { name: '04-path-b',           url: '/onboarding/path-b' },
  { name: '05-path-b-rec',       url: '/onboarding/path-b/recommend' },
  { name: '06-path-c',           url: '/onboarding/path-c' },
  { name: '07-template',         url: '/onboarding/template' },
  { name: '08-topics',           url: '/topics' },
  { name: '09-health',           url: '/health' },
  { name: '10-login',            url: '/login' },
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  // Login
  await page.goto(`${URL}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', 'devtest@vp.local');
  await page.fill('input[type="password"]', 'dev123');
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 10_000 });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);

  for (const p of PAGES) {
    try {
      await page.goto(`${URL}${p.url}`, { waitUntil: 'networkidle', timeout: 15_000 });
      await page.waitForTimeout(800);
      await page.screenshot({ path: `${OUT}/light-${p.name}.png`, fullPage: true });
      console.log(`  light-${p.name} ✓`);

      if (p.url === '/login') {
        // log back in
        await page.fill('input[type="email"]', 'devtest@vp.local');
        await page.fill('input[type="password"]', 'dev123');
        await page.click('button[type="submit"]');
        await page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 10_000 });
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(500);
      }
    } catch (e) {
      console.error(`  ${p.name} FAIL: ${e.message}`);
    }
  }

  // Main page + Inbox + dark mode
  await page.goto(`${URL}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/light-11-main.png`, fullPage: true });
  console.log('  light-11-main ✓');

  // Open Inbox
  const inboxBtn = page.locator('text=互动').first();
  if (await inboxBtn.isVisible().catch(() => false)) {
    await inboxBtn.click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/light-12-main-inbox.png`, fullPage: false });
    console.log('  light-12-main-inbox ✓');
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(300);
  }

  // Switch to dark mode
  await page.evaluate(() => {
    localStorage.setItem('vp_theme', 'dark');
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  for (const p of [PAGES[0], PAGES[6], PAGES[7], PAGES[8]]) {
    try {
      await page.goto(`${URL}${p.url}`, { waitUntil: 'networkidle', timeout: 15_000 });
      await page.waitForTimeout(800);
      await page.screenshot({ path: `${OUT}/dark-${p.name}.png`, fullPage: true });
      console.log(`  dark-${p.name} ✓`);
    } catch (e) {
      console.error(`  dark-${p.name} FAIL: ${e.message}`);
    }
  }

  await page.goto(`${URL}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/dark-11-main.png`, fullPage: true });
  console.log('  dark-11-main ✓');

  await browser.close();
  console.log(`\nFinal screenshots saved to ${OUT}`);
})().catch((e) => { console.error('FATAL:', e); process.exit(1); });
