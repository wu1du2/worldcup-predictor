import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildOddsImportSnapshotRow,
  writeOddsImportSnapshot,
} from '../src/oddsImportSnapshots.mjs';

test('buildOddsImportSnapshotRow preserves raw HTML and parsed odds payload for audit', () => {
  const row = buildOddsImportSnapshotRow({
    source: '500',
    sourceDate: '2026-06-13',
    sourceUrl: 'https://trade.500.com/jczq/index.php?g=2&playid=271&date=2026-06-13',
    rawHtml: '<html>score odds</html>',
    matches: [
      {
        issue: '周六001',
        home: '加拿大',
        away: '波黑',
        kickoffLabel: '06-13 03:00',
        scores: [{ score: '1-1', odds: 8 }],
      },
    ],
    rows: [
      {
        source: '500',
        source_match_key: '周六001|加拿大|波黑|06-13 03:00',
        score: '1-1',
        odds: 8,
      },
    ],
    createdAt: '2026-06-13T00:05:00.000Z',
  });

  assert.deepEqual(row, {
    source: '500',
    source_date: '2026-06-13',
    source_url: 'https://trade.500.com/jczq/index.php?g=2&playid=271&date=2026-06-13',
    raw_html: '<html>score odds</html>',
    parsed_json: {
      matches: [
        {
          issue: '周六001',
          home: '加拿大',
          away: '波黑',
          kickoffLabel: '06-13 03:00',
          scores: [{ score: '1-1', odds: 8 }],
        },
      ],
      rows: [
        {
          source: '500',
          source_match_key: '周六001|加拿大|波黑|06-13 03:00',
          score: '1-1',
          odds: 8,
        },
      ],
    },
    matches_count: 1,
    rows_count: 1,
    created_at: '2026-06-13T00:05:00.000Z',
  });
});

test('writeOddsImportSnapshot inserts a snapshot row and returns true', async () => {
  const calls = [];
  const client = {
    from(table) {
      return {
        insert(row) {
          calls.push({ table, row });
          return Promise.resolve({ error: null });
        },
      };
    },
  };

  const row = buildOddsImportSnapshotRow({
    source: '500',
    sourceDate: '2026-06-13',
    sourceUrl: 'https://example.com',
    rawHtml: '<html></html>',
    matches: [],
    rows: [],
    createdAt: '2026-06-13T00:05:00.000Z',
  });

  assert.equal(await writeOddsImportSnapshot({ client, row }), true);
  assert.deepEqual(calls, [{ table: 'odds_import_snapshots', row }]);
});

test('writeOddsImportSnapshot reports false instead of failing the odds import', async () => {
  const warnings = [];
  const client = {
    from() {
      return {
        insert() {
          return Promise.resolve({ error: new Error('table missing') });
        },
      };
    },
  };

  const result = await writeOddsImportSnapshot({
    client,
    row: {
      source: '500',
      source_date: '2026-06-13',
      source_url: 'https://example.com',
      raw_html: '<html></html>',
      parsed_json: { matches: [], rows: [] },
      matches_count: 0,
      rows_count: 0,
      created_at: '2026-06-13T00:05:00.000Z',
    },
    warn: (message) => warnings.push(message),
  });

  assert.equal(result, false);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Odds import snapshot was not saved/);
});
