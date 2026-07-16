// Verify rebrand — sidebar, empty state, login page
import { chromium } from '@playwright/test';
import { mkdirSync } from 'fs';

const URL = 'http://localhost:3000';
const OUT = '/tmp/vp-audit/rebrand';
mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  // Login page (not logged in)
  await page.goto(`${URL}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/01-login.png`, fullPage: true });
  console.log('  01-login ✓');

  // Login as devtest
  await page.fill('input[type="email"]', 'devtest@vp.local');
  await page.fill('input[type="password"]', 'dev123');
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 10_000 });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(800);

  // Main page
  await page.screenshot({ path: `${OUT}/02-main.png`, fullPage: true });
  console.log('  02-main ✓');

  await browser.close();
})().catch((e) => { console.error('FATAL:', e); process.exit(1); });
