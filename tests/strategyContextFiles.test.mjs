import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { attachMatchStrategyContexts } from '../src/strategyContextFiles.mjs';

test('attachMatchStrategyContexts reads context files from stable match_info directories', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'strategy-context-files-'));
  const contextDir = path.join(rootDir, 'match_info', '2026-06-26_日本_vs_瑞典');
  await mkdir(contextDir, { recursive: true });
  await writeFile(path.join(contextDir, 'context.json'), JSON.stringify({
    context_quality: 'weak_external_prematch',
    publicContext: {
      teamNews: ['日本边路速度占优'],
    },
  }), 'utf8');

  const matches = await attachMatchStrategyContexts({
    matches: [
      { id: 'm1', date: '2026-06-26', time: '07:00', home: '日本', away: '瑞典' },
      { id: 'm2', date: '2026-06-26', time: '10:00', home: '土耳其', away: '美国' },
    ],
    matchInfoRoot: path.join(rootDir, 'match_info'),
  });

  assert.equal(matches[0].strategyContext.context_quality, 'weak_external_prematch');
  assert.equal(matches[0].strategyContext.publicContext.teamNews[0], '日本边路速度占优');
  assert.deepEqual(matches[1].strategyContext, {});
});
