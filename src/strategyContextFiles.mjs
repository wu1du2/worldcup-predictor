import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { getHistoricalContextDirName } from './historicalContextBuilder.mjs';

export async function attachMatchStrategyContexts({ matches, matchInfoRoot }) {
  return Promise.all((matches || []).map(async (match) => ({
    ...match,
    strategyContext: await loadMatchStrategyContext({ match, matchInfoRoot }),
  })));
}

export async function loadMatchStrategyContext({ match, matchInfoRoot }) {
  if (!matchInfoRoot || !match) return {};

  const contextPath = path.join(matchInfoRoot, getHistoricalContextDirName(match), 'context.json');
  try {
    return JSON.parse(await readFile(contextPath, 'utf8'));
  } catch {
    return {};
  }
}
