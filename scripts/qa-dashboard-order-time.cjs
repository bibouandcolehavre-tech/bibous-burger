const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium, webkit } = require('/Users/nowar/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const { renderFixture } = require('../restaurant-dashboard/order-time.test.cjs');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'work', 'pickup-time', new Date().toISOString().replace(/[:.]/g, '-'));
fs.mkdirSync(out, { recursive: true });
const css = ['styles.css', 'workspace.css', 'pwa.css'].map(file => fs.readFileSync(path.join(root, 'restaurant-dashboard', file), 'utf8')).join('\n');
const checks = [];
(async () => {
  for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
    const browser = await engine.launch({ headless: true, ...(name === 'chromium' ? { channel: 'chrome' } : {}) });
    try {
      for (const width of [375, 768, 1280]) {
        const page = await browser.newPage({ viewport: { width, height: 1000 } });
        await page.route('**/*', route => route.abort());
        const fixture = renderFixture();
        await page.setContent(`<!doctype html><html lang="fr"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><main class="main-panel"><h1>Commandes · exemple de contrôle</h1><div class="orders-workspace"><div class="order-queue">${fixture.queue}</div><div class="orders-list">${fixture.detail}</div></div><h2>Accueil · commandes en cours</h2>${fixture.home}</main></body></html>`);
        const measurements = await page.locator('.order-time').evaluateAll(elements => elements.map(element => {
          const style = getComputedStyle(element), bounds = element.getBoundingClientRect(), parent = element.parentElement.getBoundingClientRect();
          return { text: element.textContent, size: parseFloat(style.fontSize), weight: Number(style.fontWeight), fits: bounds.right <= parent.right + 1 && bounds.left >= parent.left - 1 };
        }));
        assert.equal(measurements.length, 3);
        assert.ok(measurements.every(item => item.text === '19:15' && item.size >= 26 && item.weight >= 800 && item.fits));
        assert.ok(measurements[1].size >= 32);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        await page.screenshot({ path: path.join(out, `${name}-${width}.png`), fullPage: true });
        checks.push({ browser: name, width, measurements, pass: true });
        await page.close();
      }
    } finally { await browser.close(); }
  }
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ checkedAt: new Date().toISOString(), fictitiousFixturesOnly: true, noProductionRequests: true, checks }, null, 2));
  console.log(JSON.stringify({ out, checks: checks.length, passed: true }));
})().catch(error => { console.error(error); process.exitCode = 1; });
