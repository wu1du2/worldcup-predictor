import test from 'node:test';
import assert from 'node:assert/strict';

import { buildAllScoreOddsTrendRows, buildScoreOddsTrendRows } from '../src/scoreOddsTrends.mjs';

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
              issue: '周三022',
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
              issue: '周三022',
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

test('buildAllScoreOddsTrendRows computes trends for every match found in snapshots', () => {
  const rows = buildAllScoreOddsTrendRows({
    snapshots: [
      {
        created_at: '2026-06-15T03:45:02.807Z',
        parsed_json: {
          matches: [
            {
              issue: '周三022',
              kickoffLabel: '06-18 04:00',
              home: '英格兰',
              away: '克罗地亚',
              scores: [{ score: '1-0', odds: 5.5 }],
            },
            {
              issue: '周三023',
              kickoffLabel: '06-18 07:00',
              home: '法国',
              away: '德国',
              scores: [{ score: '胜其他', odds: 100 }],
            },
          ],
        },
      },
      {
        created_at: '2026-06-17T19:55:39.141Z',
        parsed_json: {
          matches: [
            {
              issue: '周三022',
              kickoffLabel: '06-18 04:00',
              home: '英格兰',
              away: '克罗地亚',
              scores: [{ score: '1-0', odds: 6.3 }],
            },
            {
              issue: '周三023',
              kickoffLabel: '06-18 07:00',
              home: '法国',
              away: '德国',
              scores: [{ score: '胜其他', odds: 80 }],
            },
          ],
        },
      },
    ],
  });

  assert.deepEqual(rows.map((row) => [row.source_match_key, row.score, row.first_odds, row.latest_odds]), [
    ['周三022|英格兰|克罗地亚|06-18 04:00', '1-0', 5.5, 6.3],
    ['周三023|法国|德国|06-18 07:00', '胜其他', 100, 80],
  ]);
  assert.equal(Math.round(rows[0].change_pct * 10) / 10, 14.5);
  assert.equal(Math.round(rows[1].change_pct * 10) / 10, -20);
});

test('buildAllScoreOddsTrendRows normalizes Sporttery team aliases from snapshots', () => {
  const rows = buildAllScoreOddsTrendRows({
    snapshots: [
      {
        created_at: '2026-06-23T03:05:24.520Z',
        parsed_json: {
          matches: [
            {
              issue: '周二045',
              kickoffLabel: '06-24 01:00',
              home: '葡萄牙',
              away: '乌兹别克',
              scores: [{ score: '2-0', odds: 4.75 }],
            },
            {
              issue: '周二048',
              kickoffLabel: '06-24 10:00',
              home: '哥伦比亚',
              away: '刚果(金)',
              scores: [{ score: '1-0', odds: 6.5 }],
            },
          ],
        },
      },
      {
        created_at: '2026-06-23T11:55:33.768Z',
        parsed_json: {
          matches: [
            {
              issue: '周二045',
              kickoffLabel: '06-24 01:00',
              home: '葡萄牙',
              away: '乌兹别克',
              scores: [{ score: '2-0', odds: 4.75 }],
            },
            {
              issue: '周二048',
              kickoffLabel: '06-24 10:00',
              home: '哥伦比亚',
              away: '刚果(金)',
              scores: [{ score: '1-0', odds: 7.8 }],
            },
          ],
        },
      },
    ],
  });

  assert.deepEqual(rows.map((row) => [row.source_match_key, row.home, row.away, row.score]), [
    ['周二045|葡萄牙|乌兹别克斯坦|06-24 01:00', '葡萄牙', '乌兹别克斯坦', '2-0'],
    ['周二048|哥伦比亚|刚果民主共和国|06-24 10:00', '哥伦比亚', '刚果民主共和国', '1-0'],
  ]);
  assert.equal(Math.round(rows[1].change_pct * 10) / 10, 20);
});
