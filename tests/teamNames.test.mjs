import test from 'node:test';
import assert from 'node:assert/strict';

import { attachTeamsToMatches, parseTeamNameCsv, toTeamUpsertRows } from '../src/teamNames.mjs';

const csv = `name_en,name_cn
Mexico,墨西哥
South Africa,南非
United States,美国
Paraguay,巴拉圭
`;

test('parseTeamNameCsv reads English and Chinese team names', () => {
  assert.deepEqual(parseTeamNameCsv(csv), [
    { name_en: 'Mexico', name_cn: '墨西哥' },
    { name_en: 'South Africa', name_cn: '南非' },
    { name_en: 'United States', name_cn: '美国' },
    { name_en: 'Paraguay', name_cn: '巴拉圭' },
  ]);
});

test('toTeamUpsertRows adds the ESPN source for stable upsert keys', () => {
  assert.deepEqual(toTeamUpsertRows(parseTeamNameCsv(csv)), [
    { source: 'espn', name_en: 'Mexico', name_cn: '墨西哥' },
    { source: 'espn', name_en: 'South Africa', name_cn: '南非' },
    { source: 'espn', name_en: 'United States', name_cn: '美国' },
    { source: 'espn', name_en: 'Paraguay', name_cn: '巴拉圭' },
  ]);
});

test('attachTeamsToMatches links match rows to team ids and Chinese name snapshots', () => {
  const matches = [
    {
      match_code: 'espn-1',
      home: 'United States',
      away: 'Paraguay',
    },
  ];
  const teams = [
    { id: 'team-usa', source: 'espn', name_en: 'United States', name_cn: '美国' },
    { id: 'team-par', source: 'espn', name_en: 'Paraguay', name_cn: '巴拉圭' },
  ];

  assert.deepEqual(attachTeamsToMatches(matches, teams), [
    {
      match_code: 'espn-1',
      home: 'United States',
      away: 'Paraguay',
      home_team_id: 'team-usa',
      away_team_id: 'team-par',
      home_cn: '美国',
      away_cn: '巴拉圭',
    },
  ]);
});
