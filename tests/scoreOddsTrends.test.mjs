import test from 'node:test';
import assert from 'node:assert/strict';

import { buildScoreOddsTrendRows } from '../src/scoreOddsTrends.mjs';

test('buildScoreOddsTrendRows computes first-to-latest odds changes for one match', () => {
  const rows = buildScoreOddsTrendRows({
    matchKey: {
      source: '500',
      issue: '周三022',
      kickoffLabel: '06-18 04:00',
      home: '英格兰',
      away: '克罗地亚',
    },
    snapshots: [
      {
        created_at: '2026-06-15T03:45:02.807Z',
        parsed_json: {
          matches: [
            {
              kickoffLabel: '06-18 04:00',
              home: '英格兰',
              away: '克罗地亚',
              scores: [
                { score: '4-2', odds: 75 },
                { score: '2-1', odds: 7 },
              ],
            },
          ],
        },
      },
      {
        created_at: '2026-06-17T19:55:39.141Z',
        parsed_json: {
          matches: [
            {
              kickoffLabel: '06-18 04:00',
              home: '英格兰',
              away: '克罗地亚',
              scores: [
                { score: '4-2', odds: 60 },
                { score: '2-1', odds: 5.6 },
              ],
            },
          ],
        },
      },
    ],
  });

  assert.deepEqual(rows.map(({ change_pct, ...row }) => row), [
    {
      source: '500',
      source_match_key: '周三022|英格兰|克罗地亚|06-18 04:00',
      home: '英格兰',
      away: '克罗地亚',
      kickoff_label: '06-18 04:00',
      score: '4-2',
      first_odds: 75,
      latest_odds: 60,
      first_seen_at: '2026-06-15T03:45:02.807Z',
      latest_seen_at: '2026-06-17T19:55:39.141Z',
      snapshots_count: 2,
      updated_at: '2026-06-17T19:55:39.141Z',
    },
    {
      source: '500',
      source_match_key: '周三022|英格兰|克罗地亚|06-18 04:00',
      home: '英格兰',
      away: '克罗地亚',
      kickoff_label: '06-18 04:00',
      score: '2-1',
      first_odds: 7,
      latest_odds: 5.6,
      first_seen_at: '2026-06-15T03:45:02.807Z',
      latest_seen_at: '2026-06-17T19:55:39.141Z',
      snapshots_count: 2,
      updated_at: '2026-06-17T19:55:39.141Z',
    },
  ]);
  assert.equal(Math.round(rows[0].change_pct * 10) / 10, -20);
  assert.equal(Math.round(rows[1].change_pct * 10) / 10, -20);
});
