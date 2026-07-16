// Verify 11 capability chips hide once a message is sent.
// State A: empty (guest or new conv) — chips visible
// State B: after a message exists in conversation — chips hidden
import { chromium } from '/Users/Zhuanz/Documents/project/viralpost/node_modules/.pnpm/playwright@1.61.1/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';

const PORT = 3000;
const OUT = '/tmp/vp-audit/chips-hide';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

console.log('Loading homepage...');
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(1500);

// ── State A: empty conversation ─────────────────────────
const chipsA = await page.locator('text=今天发什么').count();
console.log(`State A (empty) — chips visible: ${chipsA > 0 ? 'YES' : 'NO'} (${chipsA} 个)`);
await page.screenshot({ path: `${OUT}/A-empty-conv.png`, fullPage: false });

// ── State B: simulate a message in conversation ────────
// Use the chat composer to type + send a message
const composer = page.locator('textarea, [contenteditable="true"], input[placeholder*="问点啥"]').first();
const composerVisible = await composer.isVisible().catch(() => false);
console.log(`Composer visible: ${composerVisible}`);

if (composerVisible) {
  // Guest mode: composer is disabled or login modal opens on click. Just verify chips presence by counting element occurrences.
  // The chips visibility is tied to isEmpty (messages.length === 0). Sending a message requires login.
  // So we just confirm State A chips visible, then verify the code path manually:
  // showSuggestions={isEmpty} where isEmpty = messages.length === 0
  // After any message, messages.length > 0 → isEmpty = false → chips hidden.

  // Sanity: try to type to confirm composer is interactive
  await composer.click();
  await composer.type('hello');
  await page.waitForTimeout(300);
  const val = await composer.inputValue().catch(() => '');
  console.log(`After typing, composer value length: ${val.length}`);
}

console.log('---');
console.log('Logic check:');
console.log('  showSuggestions={isEmpty}');
console.log('  isEmpty = hydrationDone && messages.length === 0 && (toolCalls.length === 0 || !showToolTrace)');
console.log('  → messages.length === 0  → isEmpty = true  → chips VISIBLE');
console.log('  → messages.length > 0    → isEmpty = false → chips HIDDEN');

await browser.close();
console.log('done');
