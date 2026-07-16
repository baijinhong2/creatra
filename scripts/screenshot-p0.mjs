// P0 verification: after emoji → lucide replacement
import { chromium } from '@playwright/test';
import { mkdirSync } from 'fs';

const URL = 'http://localhost:3000';
const OUT = '/tmp/vp-audit/p0';
mkdirSync(OUT, { recursive: true });

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
  await page.waitForTimeout(800);

  // Main page
  await page.screenshot({ path: `${OUT}/01-main.png`, fullPage: true });

  // Onboarding entry
  await page.goto(`${URL}/onboarding`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/02-onboarding.png`, fullPage: true });

  // Topics
  await page.goto(`${URL}/topics`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/03-topics.png`, fullPage: true });

  // Health
  await page.goto(`${URL}/health`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/04-health.png`, fullPage: true });

  // Path C (most emoji)
  await page.goto(`${URL}/onboarding/path-c`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/05-path-c.png`, fullPage: true });

  // Inbox
  await page.goto(`${URL}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const inboxBtn = page.locator('text=互动').first();
  if (await inboxBtn.isVisible().catch(() => false)) {
    await inboxBtn.click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/06-inbox.png`, fullPage: false });
  }

  // UserMenu
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(300);
  const userPill = page.locator('[aria-label*="用户菜单"]').first();
  if (await userPill.isVisible().catch(() => false)) {
    await userPill.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/07-usermenu.png`, fullPage: false });
  }

  await browser.close();
  console.log('P0 verification screenshots saved to', OUT);
})().catch((e) => { console.error('FAIL:', e); process.exit(1); });
