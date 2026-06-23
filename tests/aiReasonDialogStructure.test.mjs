import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const mainSource = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');

test('AI reason dialog keeps the header visually minimal on mobile', () => {
  const dialogSource = mainSource.slice(
    mainSource.indexOf('function AiReasonDialog'),
    mainSource.indexOf('function AddPlayerDialog'),
  );

  assert.ok(dialogSource.includes('aria-label="返回"'));
  assert.doesNotMatch(dialogSource, />返回</);
  assert.doesNotMatch(dialogSource, /AI推荐理由/);
  assert.doesNotMatch(dialogSource, /dialog\.match\.home/);
  assert.doesNotMatch(dialogSource, /dialog\.match\.away/);
});
