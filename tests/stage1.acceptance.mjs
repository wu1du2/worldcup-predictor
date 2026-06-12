import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(
  '/Users/bytedance/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright',
);

const baseUrl = process.env.APP_URL || 'http://127.0.0.1:4173';
const artifactDir = new URL('../docs/artifacts/stage1/', import.meta.url);

await mkdir(artifactDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

try {
  await page.addInitScript(() => window.localStorage.clear());
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.screenshot({ path: new URL('home-empty.png', artifactDir).pathname, fullPage: true });

  await page.getByRole('button', { name: '新增名字' }).click();
  await page.screenshot({ path: new URL('new-player-dialog.png', artifactDir).pathname, fullPage: true });
  await page.locator('[data-new-player-name]').fill('小吴');
  await page.getByRole('button', { name: '确定新增' }).click();
  await page.getByRole('button', { name: '小吴' }).click();
  await page.locator('[data-match-id="m01"][data-score="1-0"]').click();
  await page.locator('[data-match-id="m01"][data-score="2-1"]').click();
  await page.locator('[data-match-id="m02"][data-score="0-0"]').click();
  await page.screenshot({ path: new URL('selected-scores.png', artifactDir).pathname, fullPage: true });

  await page.getByRole('button', { name: '确定录入' }).click();
  await page.getByRole('button', { name: '导出文本' }).click();
  const exportedText = await page.locator('[data-export-text]').inputValue();

  assert.match(exportedText, /6月13日波胆预测/);
  assert.match(exportedText, /03:00 德国 vs 日本/);
  assert.match(exportedText, /小吴：1-0, 2-1/);
  assert.match(exportedText, /21:00 阿根廷 vs 法国/);

  await page.screenshot({ path: new URL('dump-text.png', artifactDir).pathname, fullPage: true });

  const stateJson = await page.evaluate(() => window.localStorage.getItem('worldcup-prediction-stage1'));
  await writeFile(new URL('state-after-submit.json', artifactDir), `${stateJson}\n`);
  await writeFile(new URL('exported-text.txt', artifactDir), `${exportedText}\n`);
} finally {
  await browser.close();
}
