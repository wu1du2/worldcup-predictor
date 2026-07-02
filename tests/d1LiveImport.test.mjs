import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildD1LiveImportSql,
  buildLiveDateWindow,
  hasLiveWindowChanged,
  normalizeLiveComparable,
} from '../src/d1LiveImport.mjs';

test('buildLiveDateWindow covers today through the next two China dates', () => {
  assert.deepEqual(buildLiveDateWindow(new Date('2026-06-30T12:00:00+08:00')), {
    from: '2026-06-30',
    to: '2026-07-02',
    dates: ['2026-06-30', '2026-07-01', '2026-07-02'],
  });
});

test('hasLiveWindowChanged compares normalized matches and odds independent of ordering', () => {
  const current = normalizeLiveComparable({
    matches: [{ id: 'm1', date: '2026-06-30', time: '01:00', home: '巴西', away: '日本', status: 'pre' }],
    scoreOddsByMatch: { m1: [{ score: '2-1', odds: 5.8 }, { score: '1-0', odds: 7.2 }] },
  });
  const next = normalizeLiveComparable({
    matches: [{ match_code: 'm1', match_date_cn: '2026-06-30', time_cn: '01:00', home_cn: '巴西', away_cn: '日本', status: 'pre' }],
    scoreOddsRows: [
      { home: '巴西', away: '日本', kickoff_label: '06-30 01:00', score: '1-0', odds: 7.2 },
      { home: '巴西', away: '日本', kickoff_label: '06-30 01:00', score: '2-1', odds: 5.8 },
    ],
  });

  assert.equal(hasLiveWindowChanged(current, next), false);
  assert.equal(hasLiveWindowChanged(current, normalizeLiveComparable({
    matches: [{ match_code: 'm1', match_date_cn: '2026-06-30', time_cn: '01:00', home_cn: '巴西', away_cn: '日本', status: 'post', home_score: 2, away_score: 1 }],
    scoreOddsRows: [
      { home: '巴西', away: '日本', kickoff_label: '06-30 01:00', score: '1-0', odds: 7.2 },
    ],
  })), true);
});

test('buildD1LiveImportSql writes only live matches, odds, and one import report', () => {
  const sql = buildD1LiveImportSql({
    matches: [{
      match_code: 'espn-1',
      match_date_cn: '2026-06-30',
      time_cn: '01:00',
      kickoff_at_utc: '2026-06-29T17:00:00.000Z',
      home: 'Brazil',
      away: 'Japan',
      home_cn: '巴西',
      away_cn: '日本',
      home_score: 2,
      away_score: 1,
      settlement_home_score: 2,
      settlement_away_score: 1,
      settlement_score_source: 'final',
      status: 'post',
      status_detail: 'Final',
      stage: 'Round of 32',
    }],
    scoreOddsRows: [{
      source: '500',
      source_match_key: '周二001|巴西|日本|06-30 01:00',
      home: '巴西',
      away: '日本',
      kickoff_label: '06-30 01:00',
      kickoff_at_cn: '2026-06-30T01:00:00+08:00',
      score: '2-1',
      odds: 5.8,
      updated_at: '2026-06-30T04:00:00.000Z',
    }],
    report: {
      id: 'report-1',
      startedAt: '2026-06-30T04:00:00.000Z',
      finishedAt: '2026-06-30T04:00:01.000Z',
      rowsWritten: 2,
      itemsSeen: 2,
      message: 'Updated live D1 window.',
      runUrl: 'https://github.com/run',
    },
  });

  assert.match(sql, /insert into matches/);
  assert.match(sql, /settlement_home_score, settlement_away_score, settlement_score_source/);
  assert.match(sql, /on conflict\(match_code\) do update/);
  assert.match(sql, /insert into score_odds/);
  assert.match(sql, /insert into import_reports/);
  assert.match(sql, /巴西/);
});

test('buildD1LiveImportSql keeps pre-match scores as SQL NULL instead of 0-0', () => {
  const sql = buildD1LiveImportSql({
    matches: [{
      match_code: 'espn-pre',
      match_date_cn: '2026-07-01',
      time_cn: '01:00',
      kickoff_at_utc: '2026-06-30T17:00:00.000Z',
      home: 'Ivory Coast',
      away: 'Norway',
      home_cn: '科特迪瓦',
      away_cn: '挪威',
      home_score: null,
      away_score: null,
      settlement_home_score: null,
      settlement_away_score: null,
      settlement_score_source: '',
      status: 'pre',
      status_detail: 'Scheduled',
      stage: 'Round of 32',
    }],
    report: { id: 'report-pre', startedAt: '2026-06-30T00:00:00.000Z', finishedAt: '2026-06-30T00:00:01.000Z' },
  });

  assert.match(sql, /home_score, away_score, settlement_home_score, settlement_away_score, settlement_score_source/);
  assert.match(sql, /'科特迪瓦', '挪威', NULL, NULL, NULL, NULL, '', 'pre'/);
});
