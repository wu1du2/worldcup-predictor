import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium, devices } = require(
  '/Users/bytedance/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright',
);

const baseUrl = process.env.APP_URL || 'http://127.0.0.1:5173';
const groupCode = 'stage13-nonblocking-load';
const artifactDir = new URL('../docs/artifacts/stage13/', import.meta.url);

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

await mkdir(artifactDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ ...devices['iPhone 13'] });
const page = await context.newPage();

await page.route('**/data-snapshot.json**', async (route) => {
  await route.fulfill({ status: 404, body: '' });
});

await page.route('**/rest/v1/**', async (route) => {
  const url = new URL(route.request().url());
  const table = url.pathname.split('/').at(-1);

  if (table === 'score_odds' || table === 'score_odds_trends') {
    await new Promise((resolve) => setTimeout(resolve, 5_000));
    await route.fulfill({
      status: 200,
      headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' },
      body: '[]',
    });
    return;
  }

  const payloads = {
    matches,
    groups: [{ id: 'g-stage13', code: groupCode, name: groupCode }],
    players: [{ id: 'p-stage13', name: '张三' }],
    predictions: [],
    ai_recommendations: [],
  };

  if (!payloads[table]) {
    await route.fulfill({ status: 404, body: JSON.stringify({ error: `Unhandled table ${table}` }) });
    return;
  }

  await route.fulfill({
    status: 200,
    headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' },
    body: JSON.stringify(payloads[table]),
  });
});

try {
  await page.addInitScript(() => window.localStorage.clear());
  await page.goto(`${baseUrl}/?group=${groupCode}`, { waitUntil: 'domcontentloaded' });

  await page.getByText('加拿大 vs 波黑').waitFor({ state: 'visible', timeout: 2_000 });
  assert.equal(await page.getByText('正在加载群数据...').isVisible().catch(() => false), false);

  await page.screenshot({ path: new URL('nonblocking-load-iphone13.png', artifactDir).pathname, fullPage: false });
  await writeFile(
    new URL('nonblocking-load-state.json', artifactDir),
    `${JSON.stringify({ visibleText: await page.locator('body').innerText() }, null, 2)}\n`,
  );
} finally {
  await browser.close();
}
