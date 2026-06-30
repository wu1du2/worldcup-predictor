import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildD1SeedSqlFromBackupTables,
  sqlString,
  toJsonText,
} from '../src/d1BackupExport.mjs';

test('sqlString escapes quotes and keeps null values as SQL NULL', () => {
  assert.equal(sqlString(null), 'NULL');
  assert.equal(sqlString(undefined), 'NULL');
  assert.equal(sqlString("O'Brien"), "'O''Brien'");
});

test('toJsonText serializes arrays as a SQL-safe JSON string', () => {
  assert.equal(toJsonText(['1-0', "O'Brien"]), '\'["1-0","O\'\'Brien"]\'');
});

test('buildD1SeedSqlFromBackupTables exports group, players, and predictions for D1 restore', () => {
  const sql = buildD1SeedSqlFromBackupTables({
    tables: {
      groups: [{
        id: 'g1',
        code: 'lzscqjd',
        name: 'lzscqjd',
        created_at: '2026-06-12T09:50:50.509809+00:00',
      }],
      players: [
        { id: 'p1', group_id: 'g1', name: '张三', created_at: '2026-06-12T10:00:00+00:00' },
        { id: 'p2', group_id: 'g1', name: 'AI推荐', created_at: '2026-06-12T10:01:00+00:00' },
      ],
      predictions: [{
        id: 'pr1',
        group_id: 'g1',
        player_id: 'p1',
        match_id: 'espn-1',
        scores: ['1-0', '2-1'],
        updated_at: '2026-06-13T00:00:00+00:00',
      }],
      matches: [{
        match_code: 'espn-1',
        match_date_cn: '2026-06-13',
        time_cn: '03:00',
        home: 'Canada',
        away: 'Bosnia',
        home_cn: '加拿大',
        away_cn: '波黑',
        active: true,
      }],
      score_odds: [],
      score_odds_trends: [],
      ai_recommendations: [],
      ai_strategy_stats: [],
      import_reports: [],
    },
  });

  assert.match(sql, /delete from predictions;/);
  assert.match(sql, /insert into groups \(id, code, name, created_at\) values \('g1', 'lzscqjd', 'lzscqjd'/);
  assert.match(sql, /insert into players \(id, group_id, name, created_at\) values \('p1', 'g1', '张三'/);
  assert.match(sql, /insert into predictions \(id, group_id, player_id, match_id, scores, updated_at\) values \('pr1', 'g1', 'p1', 'espn-1', '\["1-0","2-1"\]'/);
  assert.match(sql, /insert into matches /);
});
