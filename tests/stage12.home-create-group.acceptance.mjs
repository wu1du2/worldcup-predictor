import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium, devices } = require(
  '/Users/bytedance/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright',
);

const baseUrl = process.env.APP_URL || 'http://127.0.0.1:5173';
const artifactDir = new URL('../docs/artifacts/stage12/', import.meta.url);

const matches = [
  {
    id: 'row-1',
    match_code: 'm-can-bih',
    kickoff_at_utc: '2026-06-12T19:00:00.000Z',
    match_date_cn: '2026-06-13',
    time_cn: '03:00',
    home: 'Canada',
    away: 'Bosnia-Herzegovina',
    home_cn: '加拿大',
    away_cn: '波黑',
    home_score: null,
    away_score: null,
    status: 'pre',
    home_team: { name_cn: '加拿大', name_en: 'Canada' },
    away_team: { name_cn: '波黑', name_en: 'Bosnia-Herzegovina' },
  },
];

await mkdir(artifactDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ ...devices['iPhone 13'] });
const page = await context.newPage();

await page.route('**/rest/v1/**', async (route) => {
  const url = new URL(route.request().url());
  const table = url.pathname.split('/').at(-1);
  const payloads = {
    matches,
    groups: [{ id: 'g-created', code: 'aaaaaa', name: 'aaaaaa' }],
    players: [],
    predictions: [],
    score_odds: [],
  };

  if (!payloads[table]) {
    await route.fulfill({ status: 404, body: JSON.stringify({ error: `Unhandled table ${table}` }) });
    return;
  }

  await route.fulfill({
    status: 200,
    headers: {
      'access-control-allow-origin': '*',
      'content-type': 'application/json',
    },
    body: JSON.stringify(payloads[table]),
  });
});

try {
  await page.addInitScript(() => {
    Math.random = () => 0;
  });

  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '创建群链接' }).waitFor();
  await page.screenshot({ path: new URL('home-create-group-iphone13.png', artifactDir).pathname, fullPage: true });

  await page.getByRole('button', { name: '创建群链接' }).click();
  await page.waitForURL('**/?group=aaaaaa');
  await page.getByText('正在加载群数据...').waitFor({ state: 'detached' });
  await page.getByRole('dialog', { name: '群链接已创建' }).waitFor();

  const url = page.url();
  assert.match(url, /\?group=aaaaaa$/);
  assert.equal(await page.getByRole('button', { name: '创建群链接' }).count(), 0);
  assert.match(await page.getByRole('dialog', { name: '群链接已创建' }).textContent(), /点击“导出文本”可以保存本群链接/);

  await page.screenshot({ path: new URL('created-group-hint-iphone13.png', artifactDir).pathname, fullPage: true });
  await writeFile(new URL('created-group-url.txt', artifactDir), `${url}\n`);
} finally {
  await browser.close();
}
