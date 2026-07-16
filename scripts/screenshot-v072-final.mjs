// v0.7.2-final: full visual acceptance (light only — dark mode removed)
// - Guest main page (sidebar should show 登录 button, NOT avatar)
// - Login modal flow
// - All 7 onboarding pages
// - Topics / Health
// - Main page logged in
import { chromium } from '@playwright/test';
import { mkdirSync } from 'fs';

const URL = 'http://localhost:3000';
const OUT = '/tmp/vp-audit/v072-final';
mkdirSync(OUT, { recursive: true });

const ONBOARDING = [
  { name: '01-onboarding',     url: '/onboarding' },
  { name: '02-path-a',         url: '/onboarding/path-a' },
  { name: '03-path-a-paste',   url: '/onboarding/path-a/paste' },
  { name: '04-path-b',         url: '/onboarding/path-b' },
  { name: '05-path-b-rec',     url: '/onboarding/path-b/recommend' },
  { name: '06-path-c-q1',      url: '/onboarding/path-c' },
  { name: '07-template',       url: '/onboarding/template' },
];

const APP = [
  { name: '08-topics',         url: '/topics' },
  { name: '09-health',         url: '/health' },
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  // ==== GUEST MODE (no login) ====
  await page.goto(`${URL}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/00-guest-main.png`, fullPage: true });
  console.log('  00-guest-main ✓');

  // Verify sidebar shows 登录 button (not avatar)
  const loginBtnCount = await page.locator('button:has-text("登录")').count();
  const avatarCount   = await page.locator('[aria-label*="用户"]').count();
  console.log(`  sidebar: 登录 button=${loginBtnCount}, avatar=${avatarCount}`);
  if (loginBtnCount === 0) {
    throw new Error('Sidebar should show 登录 button in guest mode');
  }

  // Open login modal
  await page.locator('button:has-text("登录")').first().click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/01-login-modal.png`, fullPage: false });
  console.log('  01-login-modal ✓');

  // Submit credentials
  await page.fill('input[type="email"]', 'devtest@vp.local');
  await page.fill('input[type="password"]', 'dev123');
  await page.click('button[type="submit"]:has-text("登录")');
  await page.waitForTimeout(2500);
  console.log('  login submitted');

  // ==== LIGHT MODE: onboarding + app ====
  for (const p of [...ONBOARDING, ...APP]) {
    try {
      await page.goto(`${URL}${p.url}`, { waitUntil: 'networkidle', timeout: 15_000 });
      await page.waitForTimeout(800);
      await page.screenshot({ path: `${OUT}/light-${p.name}.png`, fullPage: true });
      console.log(`  light-${p.name} ✓`);
    } catch (e) {
      console.error(`  ${p.name} FAIL: ${e.message}`);
    }
  }

  // Main logged-in
  await page.goto(`${URL}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${OUT}/light-10-main.png`, fullPage: true });
  console.log('  light-10-main ✓');

  // (dark mode removed)

  await browser.close();
  console.log(`\nv0.7.2 final screenshots → ${OUT}`);
})().catch((e) => { console.error('FATAL:', e); process.exit(1); });
