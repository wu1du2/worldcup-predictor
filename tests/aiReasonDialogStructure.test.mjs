import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const mainSource = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
const stylesSource = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

function componentSource(name, nextName) {
  return mainSource.slice(
    mainSource.indexOf(`function ${name}`),
    mainSource.indexOf(`function ${nextName}`),
  );
}

test('AI reason dialog keeps the header visually minimal on mobile', () => {
  const dialogSource = componentSource('AiReasonDialog', 'AddPlayerDialog');

  assert.ok(dialogSource.includes('aria-label="返回"'));
  assert.doesNotMatch(dialogSource, />返回</);
  assert.doesNotMatch(dialogSource, /AI推荐理由/);
  assert.doesNotMatch(dialogSource, /dialog\.match\.home/);
  assert.doesNotMatch(dialogSource, /dialog\.match\.away/);
  assert.doesNotMatch(dialogSource, /dialog-header ai-reason-dialog-header/);
  assert.doesNotMatch(stylesSource, /\\.ai-reason-dialog-header/);
});

test('AI reason preview is full-width between the match header and score grid', () => {
  const matchCardSource = componentSource('MatchCard', 'AiReasonDialog');
  const headerCloseIndex = matchCardSource.indexOf('      </div>\n      {isAiSelected && aiReason ? (');
  const reasonIndex = matchCardSource.indexOf('className="ai-reason-inline"');
  const scoreGridIndex = matchCardSource.indexOf('className="score-grid"');

  assert.notEqual(headerCloseIndex, -1);
  assert.ok(headerCloseIndex < reasonIndex);
  assert.ok(reasonIndex < scoreGridIndex);
});
