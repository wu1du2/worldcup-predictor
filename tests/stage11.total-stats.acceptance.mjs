import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium, devices } = require(
  '/Users/bytedance/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright',
);

const baseUrl = process.env.APP_URL || 'http://127.0.0.1:5173';
const groupCode = 'stage11-total-stats';
const artifactDir = new URL('../docs/artifacts/stage11/', import.meta.url);

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
    home_score: 1,
    away_score: 1,
    status: 'post',
    home_team: { name_cn: '加拿大', name_en: 'Canada' },
    away_team: { name_cn: '波黑', name_en: 'Bosnia-Herzegovina' },
  },
  {
    id: 'row-2',
    match_code: 'm-usa-par',
    kickoff_at_utc: '2026-06-13T01:00:00.000Z',
    match_date_cn: '2026-06-13',
    time_cn: '09:00',
    home: 'USA',
    away: 'Paraguay',
    home_cn: '美国',
    away_cn: '巴拉圭',
    home_score: 2,
    away_score: 0,
    status: 'post',
    home_team: { name_cn: '美国', name_en: 'USA' },
    away_team: { name_cn: '巴拉圭', name_en: 'Paraguay' },
  },
];

const players = [
  { id: 'p-zhang', name: '张三' },
  { id: 'p-li', name: '李四' },
];

const predictions = [
  { player_id: 'p-zhang', match_id: 'm-can-bih', scores: ['1-1', '2-1'] },
  { player_id: 'p-zhang', match_id: 'm-usa-par', scores: ['2-0'] },
  { player_id: 'p-li', match_id: 'm-can-bih', scores: ['1-0'] },
  { player_id: 'p-other-group', match_id: 'm-can-bih', scores: ['1-1'] },
];

const oddsRows = [
  { home: '加拿大', away: '波黑', kickoff_label: '06-13 03:00', score: '1-1', odds: 8 },
  { home: '美国', away: '巴拉圭', kickoff_label: '06-13 09:00', score: '2-0', odds: 6 },
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
    groups: [{ id: 'g-stage11', code: groupCode, name: groupCode }],
    players,
    predictions,
    score_odds: oddsRows,
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
  await page.addInitScript(() => window.localStorage.clear());
  await page.goto(`${baseUrl}/?group=${groupCode}`, { waitUntil: 'networkidle' });
  await page.getByText('正在加载群数据...').waitFor({ state: 'detached' });
  await page.getByRole('button', { name: '更多' }).click();
  await page.getByRole('button', { name: '总榜统计' }).click();

  const statsText = await page.locator('[data-export-text]').inputValue();
  assert.equal(
    statsText,
    [
      '【总榜统计】',
      '张三 ROI 367%｜净收益 +11｜命中 2/2｜成本 3',
      '李四 ROI -100%｜净收益 -1｜命中 0/1｜成本 1',
    ].join('\n'),
  );
  assert.doesNotMatch(statsText, /p-other-group/);

  await page.screenshot({ path: new URL('total-stats-iphone13.png', artifactDir).pathname, fullPage: true });
  await writeFile(new URL('total-stats-text.txt', artifactDir), `${statsText}\n`);
} finally {
  await browser.close();
}
