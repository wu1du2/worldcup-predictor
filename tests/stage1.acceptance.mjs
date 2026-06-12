import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(
  '/Users/bytedance/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright',
);

const baseUrl = process.env.APP_URL || 'http://127.0.0.1:5173';
const groupCode = `stage1-${Date.now()}`;
const artifactDir = new URL('../docs/artifacts/stage1/', import.meta.url);

await mkdir(artifactDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  permissions: ['clipboard-read', 'clipboard-write'],
});
const page = await context.newPage();

try {
  await page.addInitScript(() => window.localStorage.clear());
  await page.goto(`${baseUrl}/?group=${groupCode}`, { waitUntil: 'networkidle' });
  await page.getByText('正在加载群数据...').waitFor({ state: 'detached' });
  await page.screenshot({ path: new URL('home-empty.png', artifactDir).pathname, fullPage: true });

  await page.getByRole('button', { name: '新增名字' }).click();
  await page.screenshot({ path: new URL('new-player-dialog.png', artifactDir).pathname, fullPage: true });
  await page.locator('[data-new-player-name]').fill('小吴');
  await page.getByRole('button', { name: '确定新增' }).click();
  await page.getByRole('button', { name: '小吴' }).click();
  const firstMatchScoreOneNil = page.locator('[data-score="1-0"]').first();
  const firstMatchScoreTwoOne = page.locator('[data-score="2-1"]').first();
  await firstMatchScoreOneNil.click();
  await firstMatchScoreTwoOne.click();
  await page.screenshot({ path: new URL('selected-scores.png', artifactDir).pathname, fullPage: true });

  await page.getByRole('button', { name: '确定录入' }).click();
  await page.getByText('已保存，可以回群里继续催大家交卷。').waitFor();
  await page.getByRole('button', { name: '导出文本' }).click();
  const exportedText = await page.locator('[data-export-text]').inputValue();

  assert.match(exportedText, /\d+月\d+日比分预测/);
  assert.match(exportedText, /\d\d:\d\d .+ vs .+/);
  assert.match(exportedText, /小吴：1-0, 2-1/);

  await page.getByRole('button', { name: '一键复制' }).click();
  await page.getByRole('button', { name: '已复制' }).waitFor();
  const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
  assert.equal(clipboardText, exportedText);

  await page.screenshot({ path: new URL('dump-text.png', artifactDir).pathname, fullPage: true });

  const stateJson = await page.evaluate(() => window.localStorage.getItem('worldcup-prediction-stage2'));
  await writeFile(new URL('state-after-submit.json', artifactDir), `${stateJson}\n`);
  await writeFile(new URL('exported-text.txt', artifactDir), `${exportedText}\n`);
} finally {
  await browser.close();
}
