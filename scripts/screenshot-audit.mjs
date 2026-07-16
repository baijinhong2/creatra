// Comprehensive screenshot audit
import { chromium } from '@playwright/test';
import { mkdirSync } from 'fs';

const URL = 'http://localhost:3000';
const OUT = '/tmp/vp-audit';
mkdirSync(OUT, { recursive: true });

const SHOTS = [
  // Onboarding flow
  { name: '01-onboarding-entry',     url: '/onboarding',              wait: 800 },
  { name: '02-onboarding-path-a',    url: '/onboarding/path-a',       wait: 800 },
  { name: '03-onboarding-path-a-paste', url: '/onboarding/path-a/paste', wait: 800 },
  { name: '04-onboarding-path-b',    url: '/onboarding/path-b',       wait: 800 },
  { name: '05-onboarding-path-b-rec', url: '/onboarding/path-b/recommend', wait: 800 },
  { name: '06-onboarding-path-c',    url: '/onboarding/path-c',       wait: 800 },
  { name: '07-onboarding-template',  url: '/onboarding/template',     wait: 800 },
  // Sidebar pages
  { name: '08-topics',               url: '/topics',                  wait: 1500 },
  { name: '09-health',               url: '/health',                  wait: 1500 },
  // Login
  { name: '10-login',                url: '/login',                   wait: 600 },
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  // Login first
  console.log('Login...');
  await page.goto(`${URL}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', 'devtest@vp.local');
  await page.fill('input[type="password"]', 'dev123');
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 10_000 });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(800);

  for (const s of SHOTS) {
    if (s.url === '/login') {
      // logout first to get login page
      await page.goto(`${URL}/api/auth/logout`).catch(() => {});
      await page.waitForTimeout(300);
    }
    try {
      await page.goto(`${URL}${s.url}`, { waitUntil: 'networkidle', timeout: 15_000 });
      await page.waitForTimeout(s.wait);
      await page.screenshot({ path: `${OUT}/${s.name}.png`, fullPage: true });
      console.log(`  ${s.name} ✓`);

      if (s.url === '/login') {
        // log back in
        await page.fill('input[type="email"]', 'devtest@vp.local');
        await page.fill('input[type="password"]', 'dev123');
        await page.click('button[type="submit"]');
        await page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 10_000 });
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(500);
      }
    } catch (e) {
      console.error(`  ${s.name} FAIL:`, e.message);
    }
  }

  // Main page composite shots
  console.log('Main page variants...');
  await page.goto(`${URL}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${OUT}/11-main-empty.png`, fullPage: true });
  console.log('  11-main-empty ✓');

  // Open InboxPanel
  const inboxBtn = page.locator('text=互动').first();
  if (await inboxBtn.isVisible().catch(() => false)) {
    await inboxBtn.click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/12-main-inbox.png`, fullPage: false });
    console.log('  12-main-inbox ✓');
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(300);
  }

  // Open Sources panel
  const sourcesBtn = page.locator('text=资料库, text=Sources').first();
  const sourcesBtn2 = page.locator('button:has-text("资料库"), button:has-text("Sources")').first();
  const sb = await sourcesBtn2.isVisible().catch(() => false) ? sourcesBtn2 : null;
  if (sb) {
    await sb.click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/13-main-sources.png`, fullPage: false });
    console.log('  13-main-sources ✓');
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(300);
  }

  // Open UserMenu
  const userPill = page.locator('[aria-label="打开用户菜单"]').first();
  if (await userPill.isVisible().catch(() => false)) {
    await userPill.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/14-main-usermenu.png`, fullPage: false });
    console.log('  14-main-usermenu ✓');
    await page.keyboard.press('Escape').catch(() => {});
  }

  await browser.close();
  console.log(`\nAll saved to ${OUT}`);
})().catch((e) => { console.error('FATAL:', e); process.exit(1); });
