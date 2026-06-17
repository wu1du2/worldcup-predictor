import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSportteryScoreUrl,
  dedupeParsedMatches,
  dedupeScoreOptionRows,
  filterMatchesByKickoffDates,
  parseSportteryScoreOddsHtml,
  toScoreOptionRows,
  validateParsedOddsMatches,
  validateScoreOddsRows,
} from '../src/sportteryOdds.mjs';

const html = `
<tr data-index="1">
  <td>2026-06-12 星期五</td>
  <td>周五003</td>
  <td>世界杯</td>
  <td>06-13 03:00</td>
  <td>加拿大 VS 波黑</td>
  <td>1:0 5.30 2:0 6.50 2:1 5.65 胜其它 100.00 0:0 9.50 1:1 5.30 2:2 16.50 平其它 500.00 0:1 10.50 0:2 28.00 1:2 14.00 负其它 400.00</td>
</tr>
`;

test('parseSportteryScoreOddsHtml extracts match score odds from 500.com score page text', () => {
  assert.deepEqual(parseSportteryScoreOddsHtml(html), [
    {
      issue: '周五003',
      competition: '世界杯',
      kickoffLabel: '06-13 03:00',
      home: '加拿大',
      away: '波黑',
      scores: [
        { score: '1-0', odds: 5.3 },
        { score: '2-0', odds: 6.5 },
        { score: '2-1', odds: 5.65 },
        { score: '胜其他', odds: 100 },
        { score: '0-0', odds: 9.5 },
        { score: '1-1', odds: 5.3 },
        { score: '2-2', odds: 16.5 },
        { score: '平其他', odds: 500 },
        { score: '0-1', odds: 10.5 },
        { score: '0-2', odds: 28 },
        { score: '1-2', odds: 14 },
        { score: '负其他', odds: 400 },
      ],
    },
  ]);
});

test('toScoreOptionRows converts parsed odds to future score_options upsert rows', () => {
  const parsed = parseSportteryScoreOddsHtml(html);
  const rows = toScoreOptionRows(parsed, '2026-06-12T10:00:00.000Z');

  assert.equal(rows.length, 12);
  assert.deepEqual(rows[0], {
    source: '500',
    source_match_key: '周五003|加拿大|波黑|06-13 03:00',
    home: '加拿大',
    away: '波黑',
    kickoff_label: '06-13 03:00',
    score: '1-0',
    odds: 5.3,
    updated_at: '2026-06-12T10:00:00.000Z',
  });
  assert.deepEqual(rows.at(-1), {
    source: '500',
    source_match_key: '周五003|加拿大|波黑|06-13 03:00',
    home: '加拿大',
    away: '波黑',
    kickoff_label: '06-13 03:00',
    score: '负其他',
    odds: 400,
    updated_at: '2026-06-12T10:00:00.000Z',
  });
});

test('dedupeParsedMatches keeps one match per source key when daily pages overlap', () => {
  const parsed = parseSportteryScoreOddsHtml(html);

  assert.deepEqual(dedupeParsedMatches([...parsed, ...parsed]), [
    {
      issue: '周五003',
      competition: '世界杯',
      kickoffLabel: '06-13 03:00',
      home: '加拿大',
      away: '波黑',
      scores: [
        { score: '1-0', odds: 5.3 },
        { score: '2-0', odds: 6.5 },
        { score: '2-1', odds: 5.65 },
        { score: '胜其他', odds: 100 },
        { score: '0-0', odds: 9.5 },
        { score: '1-1', odds: 5.3 },
        { score: '2-2', odds: 16.5 },
        { score: '平其他', odds: 500 },
        { score: '0-1', odds: 10.5 },
        { score: '0-2', odds: 28 },
        { score: '1-2', odds: 14 },
        { score: '负其他', odds: 400 },
      ],
    },
  ]);
});

test('dedupeParsedMatches also keeps one odds value per score inside a noisy source block', () => {
  const parsed = parseSportteryScoreOddsHtml(`
    <tr>
      <td>周三024</td><td>世界杯</td><td>06-18 10:00</td><td>乌兹别克 VS 哥伦比亚</td>
      <td>1:0 19.00 0:1 5.50 1:0 8.00 0:1 10.50 胜其它 55.00 胜其它 34.00</td>
    </tr>
  `);

  assert.deepEqual(dedupeParsedMatches(parsed), [
    {
      issue: '周三024',
      competition: '世界杯',
      kickoffLabel: '06-18 10:00',
      home: '乌兹别克',
      away: '哥伦比亚',
      scores: [
        { score: '1-0', odds: 8 },
        { score: '0-1', odds: 10.5 },
        { score: '胜其他', odds: 34 },
      ],
    },
  ]);
});

test('dedupeScoreOptionRows removes repeated score rows from duplicated source fragments', () => {
  const rows = toScoreOptionRows(parseSportteryScoreOddsHtml(html), '2026-06-12T10:00:00.000Z');
  const duplicateRows = [...rows, rows[0], rows[1], rows.at(-1)];

  assert.equal(validateScoreOddsRows(dedupeScoreOptionRows(duplicateRows)).length, rows.length);
});

test('filterMatchesByKickoffDates keeps only requested China dates', () => {
  const matches = [
    { issue: '周五003', kickoffLabel: '06-13 03:00', home: '加拿大', away: '波黑', scores: [] },
    { issue: '周一013', kickoffLabel: '06-16 00:00', home: '西班牙', away: '佛得角', scores: [] },
  ];

  assert.deepEqual(filterMatchesByKickoffDates(matches, ['2026-06-13', '2026-06-14', '2026-06-15']), [
    { issue: '周五003', kickoffLabel: '06-13 03:00', home: '加拿大', away: '波黑', scores: [] },
  ]);
});

test('validateScoreOddsRows accepts complete unique rows', () => {
  const rows = toScoreOptionRows(parseSportteryScoreOddsHtml(html), '2026-06-12T10:00:00.000Z');

  assert.equal(validateScoreOddsRows(rows), rows);
  assert.ok(rows.some((row) => row.score === '胜其他'));
  assert.ok(rows.some((row) => row.score === '平其他'));
  assert.ok(rows.some((row) => row.score === '负其他'));
});

test('validateParsedOddsMatches rejects empty and thin parsed match batches', () => {
  assert.throws(() => validateParsedOddsMatches([]), /No score odds matches/);
  assert.throws(() => validateParsedOddsMatches([
    {
      issue: '周五003',
      competition: '世界杯',
      kickoffLabel: '06-13 03:00',
      home: '加拿大',
      away: '波黑',
      scores: [{ score: '1-0', odds: 5.3 }],
    },
  ]), /too few score odds/);
});

test('validateScoreOddsRows rejects malformed odds payloads before upsert', () => {
  assert.throws(
    () => validateScoreOddsRows([
      {
        source: '500',
        source_match_key: '周五003|加拿大|波黑|06-13 03:00',
        home: '加拿大',
        away: '波黑',
        kickoff_label: '06-13 03:00',
        score: '1:0',
        odds: 5.3,
        updated_at: '2026-06-12T10:00:00.000Z',
      },
    ]),
    /invalid score/,
  );

  assert.throws(
    () => validateScoreOddsRows([
      {
        source: '500',
        source_match_key: '周五003|加拿大|波黑|06-13 03:00',
        home: '加拿大',
        away: '波黑',
        kickoff_label: '06-13 03:00',
        score: '1-0',
        odds: 1,
        updated_at: '2026-06-12T10:00:00.000Z',
      },
    ]),
    /invalid odds/,
  );
});

test('validateScoreOddsRows rejects duplicate row keys in the same import batch', () => {
  const rows = toScoreOptionRows(parseSportteryScoreOddsHtml(html), '2026-06-12T10:00:00.000Z');

  assert.throws(() => validateScoreOddsRows([rows[0], rows[0]]), /duplicate score odds row/);
});

test('buildSportteryScoreUrl points at 500.com correct-score odds for a China date', () => {
  assert.equal(
    buildSportteryScoreUrl('2026-06-12'),
    'https://trade.500.com/jczq/index.php?g=2&playid=271&date=2026-06-12',
  );
});
