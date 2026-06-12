import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(
  '/Users/bytedance/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright',
);

const baseUrl = process.env.APP_URL || 'http://127.0.0.1:5173';
const artifactDir = new URL('../docs/artifacts/stage2/', import.meta.url);
const runId = Date.now();
const groupA = `codex-a-${runId}`;
const groupB = `codex-b-${runId}`;
const playerName = `小吴${String(runId).slice(-4)}`;

await mkdir(artifactDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  permissions: ['clipboard-read', 'clipboard-write'],
});

try {
  const page = await context.newPage();

  await page.goto(`${baseUrl}/?group=${groupA}`, { waitUntil: 'networkidle' });
  await page.getByText('正在加载群数据...').waitFor({ state: 'detached' });
  assert.equal(await page.getByRole('button', { name: '阿哲' }).count(), 0);
  await page.getByRole('button', { name: '新增名字' }).click();
  await page.locator('[data-new-player-name]').fill(playerName);
  await page.getByRole('button', { name: '确定新增' }).click();
  await page.getByRole('button', { name: playerName }).waitFor();
  await page.locator('[data-match-id="m01"][data-score="1-0"]').click();
  await page.locator('[data-match-id="m01"][data-score="2-1"]').click();
  await page.getByRole('button', { name: '确定录入' }).click();
  await page.getByText('已保存，可以回群里继续催大家交卷。').waitFor();

  await page.reload({ waitUntil: 'networkidle' });
  await page.getByText('正在加载群数据...').waitFor({ state: 'detached' });
  await page.getByRole('button', { name: '导出文本' }).click();
  const groupAText = await page.locator('[data-export-text]').inputValue();
  assert.match(groupAText, new RegExp(`${playerName}：1-0, 2-1`));
  await page.screenshot({ path: new URL('group-a-export.png', artifactDir).pathname, fullPage: false });

  await page.goto(`${baseUrl}/?group=${groupB}`, { waitUntil: 'networkidle' });
  await page.getByText('正在加载群数据...').waitFor({ state: 'detached' });
  assert.equal(await page.getByRole('button', { name: '阿哲' }).count(), 0);
  assert.equal(await page.getByRole('button', { name: playerName }).count(), 0);
  await page.getByRole('button', { name: '导出文本' }).click();
  const groupBText = await page.locator('[data-export-text]').inputValue();
  assert.doesNotMatch(groupBText, new RegExp(playerName));
  await page.screenshot({ path: new URL('group-b-export.png', artifactDir).pathname, fullPage: false });

  await writeFile(
    new URL('stage2-run.json', artifactDir),
    `${JSON.stringify({ groupA, groupB, playerName, groupAText, groupBText }, null, 2)}\n`,
  );
} finally {
  await browser.close();
}
