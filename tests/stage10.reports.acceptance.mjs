import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium, devices } = require(
  '/Users/bytedance/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright',
);

const baseUrl = process.env.APP_URL || 'http://127.0.0.1:5173';
const groupCode = 'stage10-reports';
const artifactDir = new URL('../docs/artifacts/stage10/', import.meta.url);

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
    status_detail: '',
    venue: '',
    stage: 'Group Stage',
    home_team: { name_cn: '加拿大', name_en: 'Canada' },
    away_team: { name_cn: '波黑', name_en: 'Bosnia-Herzegovina' },
  },
];

const reports = [
  {
    id: 'report-odds-failed',
    job_name: 'odds',
    status: 'failed',
    started_at: '2026-06-13T09:00:00.000Z',
    finished_at: '2026-06-13T09:00:12.000Z',
    rows_written: 0,
    items_seen: 0,
    message: 'No score odds matches parsed.',
    error_detail: 'Error: No score odds matches parsed.',
    run_url: 'https://github.com/wu1du2/worldcup-predictor/actions/runs/1',
    created_at: '2026-06-13T09:00:12.000Z',
  },
  {
    id: 'report-matches-success',
    job_name: 'matches',
    status: 'success',
    started_at: '2026-06-13T09:05:00.000Z',
    finished_at: '2026-06-13T09:05:18.000Z',
    rows_written: 72,
    items_seen: 72,
    message: 'Upserted 72 matches.',
    error_detail: '',
    run_url: 'https://github.com/wu1du2/worldcup-predictor/actions/runs/2',
    created_at: '2026-06-13T09:05:18.000Z',
  },
  {
    id: 'report-strategy-loop',
    job_name: 'strategy_loop',
    status: 'success',
    started_at: '2026-06-13T09:10:00.000Z',
    finished_at: '2026-06-13T09:12:18.000Z',
    rows_written: 1,
    items_seen: 841,
    message: '策略迭代第6轮：进入平台期。本轮最高分 77.7，历史最高分 77.7。',
    error_detail: '最佳策略：赛前泊松EV均衡 平局保护',
    run_url: 'https://github.com/wu1du2/worldcup-predictor/actions/runs/3',
    created_at: '2026-06-13T09:12:18.000Z',
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
    groups: [{ id: 'g-stage10', code: groupCode, name: groupCode }],
    players: [],
    predictions: [],
    score_odds: [],
    import_reports: reports,
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
  await page.getByRole('button', { name: '后台报告' }).click();

  const dialog = page.locator('[data-backend-report-dialog]');
  await dialog.waitFor({ state: 'visible' });
  await dialog.getByText('赔率更新').waitFor();
  const dialogText = await dialog.textContent();

  assert.match(dialogText, /后台报告/);
  assert.match(dialogText, /赔率更新/);
  assert.match(dialogText, /失败/);
  assert.match(dialogText, /No score odds matches parsed/);
  assert.match(dialogText, /比分更新/);
  assert.match(dialogText, /成功/);
  assert.match(dialogText, /写入72行/);
  assert.match(dialogText, /策略迭代/);
  assert.match(dialogText, /进入平台期/);

  await page.screenshot({ path: new URL('backend-report-iphone13.png', artifactDir).pathname, fullPage: true });
  await writeFile(new URL('backend-report-text.txt', artifactDir), `${dialogText}\n`);
} finally {
  await browser.close();
}
