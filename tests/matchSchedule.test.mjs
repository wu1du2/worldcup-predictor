import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDateTabs,
  formatChinaDateLabel,
  getDefaultMatchDateCn,
  getMatchScoreText,
  toMatchUpsertRows,
  normalizeEspnScoreboard,
} from '../src/matchSchedule.mjs';

const espnScoreboard = {
  events: [
    {
      id: '760415',
      date: '2026-06-11T19:00Z',
      status: {
        type: {
          state: 'post',
          completed: true,
          shortDetail: 'FT',
        },
      },
      competitions: [
        {
          venue: {
            fullName: 'Estadio Banorte',
            address: { city: 'Mexico City', country: 'Mexico' },
          },
          competitors: [
            {
              homeAway: 'home',
              score: '2',
              team: { displayName: 'Mexico', abbreviation: 'MEX' },
            },
            {
              homeAway: 'away',
              score: '0',
              team: { displayName: 'South Africa', abbreviation: 'RSA' },
            },
          ],
        },
      ],
    },
    {
      id: '760416',
      date: '2026-06-12T01:00Z',
      status: {
        type: {
          state: 'pre',
          completed: false,
          shortDetail: '6/12 - 9:00 AM CST',
        },
      },
      competitions: [
        {
          venue: {
            fullName: 'BMO Field',
            address: { city: 'Toronto', country: 'Canada' },
          },
          competitors: [
            {
              homeAway: 'home',
              score: '0',
              team: { displayName: 'Canada', abbreviation: 'CAN' },
            },
            {
              homeAway: 'away',
              score: '0',
              team: { displayName: 'Qatar', abbreviation: 'QAT' },
            },
          ],
        },
      ],
    },
  ],
};

test('normalizeEspnScoreboard converts ESPN events into UTC+8 match rows with scores', () => {
  const rows = normalizeEspnScoreboard(espnScoreboard);

  assert.deepEqual(rows, [
    {
      id: '760415',
      match_code: 'espn-760415',
      kickoff_at_utc: '2026-06-11T19:00:00.000Z',
      match_date_cn: '2026-06-12',
      time_cn: '03:00',
      home: 'Mexico',
      away: 'South Africa',
      home_cn: '墨西哥',
      away_cn: '南非',
      home_score: 2,
      away_score: 0,
      status: 'post',
      status_detail: 'FT',
      venue: 'Estadio Banorte, Mexico City, Mexico',
      stage: 'Group Stage',
      source: 'espn',
    },
    {
      id: '760416',
      match_code: 'espn-760416',
      kickoff_at_utc: '2026-06-12T01:00:00.000Z',
      match_date_cn: '2026-06-12',
      time_cn: '09:00',
      home: 'Canada',
      away: 'Qatar',
      home_cn: '加拿大',
      away_cn: '卡塔尔',
      home_score: null,
      away_score: null,
      status: 'pre',
      status_detail: '6/12 - 9:00 AM CST',
      venue: 'BMO Field, Toronto, Canada',
      stage: 'Group Stage',
      source: 'espn',
    },
  ]);
});

test('buildDateTabs returns sorted UTC+8 dates with compact labels and counts', () => {
  const tabs = buildDateTabs(normalizeEspnScoreboard(espnScoreboard));

  assert.deepEqual(tabs, [
    {
      date: '2026-06-12',
      label: '6月12日',
      count: 2,
    },
  ]);
});

test('buildDateTabs also accepts app match rows with date fields', () => {
  assert.deepEqual(buildDateTabs([
    { date: '2026-06-13' },
    { date: '2026-06-13' },
    { date: '2026-06-14' },
  ]), [
    { date: '2026-06-13', label: '6月13日', count: 2 },
    { date: '2026-06-14', label: '6月14日', count: 1 },
  ]);
});

test('getDefaultMatchDateCn picks today when available, otherwise next match date', () => {
  const matches = normalizeEspnScoreboard(espnScoreboard);

  assert.equal(getDefaultMatchDateCn(matches, new Date('2026-06-12T05:00:00+08:00')), '2026-06-12');
  assert.equal(getDefaultMatchDateCn(matches, new Date('2026-06-10T10:00:00+08:00')), '2026-06-12');
  assert.equal(getDefaultMatchDateCn(matches, new Date('2026-06-20T10:00:00+08:00')), '2026-06-12');
});

test('getDefaultMatchDateCn also accepts app match rows with date fields', () => {
  assert.equal(getDefaultMatchDateCn([
    { date: '2026-06-13' },
    { date: '2026-06-14' },
  ], new Date('2026-06-13T01:00:00+08:00')), '2026-06-13');
});

test('formatChinaDateLabel and getMatchScoreText produce mobile display text', () => {
  assert.equal(formatChinaDateLabel('2026-06-12'), '6月12日');
  assert.equal(getMatchScoreText({ status: 'pre', home_score: null, away_score: null }), '未开赛');
  assert.equal(getMatchScoreText({ status: 'post', home_score: 2, away_score: 0 }), '2-0');
  assert.equal(getMatchScoreText({ status: 'post', homeScore: 2, awayScore: 0 }), '2-0');
});

test('toMatchUpsertRows excludes external ids and keeps match_code as the conflict key', () => {
  const rows = toMatchUpsertRows(normalizeEspnScoreboard(espnScoreboard), '2026-06-12T12:00:00.000Z');

  assert.equal(rows[0].id, undefined);
  assert.equal(rows[0].match_code, 'espn-760415');
  assert.equal(rows[0].match_date, '2026-06-12');
  assert.equal(rows[0].kickoff_at, '2026-06-11T19:00:00.000Z');
  assert.equal(rows[0].home_team, 'Mexico');
  assert.equal(rows[0].away_team, 'South Africa');
  assert.equal(rows[0].home_team_cn, '墨西哥');
  assert.equal(rows[0].away_team_cn, '南非');
  assert.equal(rows[0].active, true);
  assert.equal(rows[0].updated_at, '2026-06-12T12:00:00.000Z');
});
