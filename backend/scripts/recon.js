// Usage: node scripts/recon.js <url>
// Opens the page headful and prints all input/button selectors so we can fix carrier code
require('dotenv').config();
const { createBrowser, createContext } = require('../src/browserFactory');

const url = process.argv[2];
if (!url) { console.error('Usage: node scripts/recon.js <url>'); process.exit(1); }

(async () => {
  const browser = await createBrowser({ headless: false });
  const context = await createContext(browser);
  const page = await context.newPage();

  console.log(`\nNavigating to ${url} ...\n`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(3000); // extra buffer for lazy-loaded forms

  const inputs = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('input, button, select')).map(el => ({
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      name: el.getAttribute('name') || null,
      type: el.getAttribute('type') || null,
      placeholder: el.getAttribute('placeholder') || null,
      class: el.className?.slice(0, 60) || null,
      'aria-label': el.getAttribute('aria-label') || null,
    }));
  });

  console.log('=== INPUTS / BUTTONS on page ===');
  inputs.forEach(el => console.log(JSON.stringify(el)));

  console.log('\nBrowser staying open — press Ctrl+C when done inspecting.\n');
  await new Promise(() => {}); // keep open
})();
