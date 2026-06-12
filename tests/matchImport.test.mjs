import test from 'node:test';
import assert from 'node:assert/strict';

import { fetchJsonWithRetry } from '../src/matchImport.mjs';

test('fetchJsonWithRetry retries a transient fetch failure and returns JSON', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (calls.length === 1) throw new Error('fetch failed');
    return {
      ok: true,
      json: async () => ({ events: [] }),
    };
  };

  const json = await fetchJsonWithRetry('https://example.test/scoreboard', {
    fetchImpl,
    retries: 2,
    timeoutMs: 50,
    waitMs: 1,
  });

  assert.deepEqual(json, { events: [] });
  assert.equal(calls.length, 2);
});

test('fetchJsonWithRetry throws the final HTTP error after retries are exhausted', async () => {
  await assert.rejects(
    () => fetchJsonWithRetry('https://example.test/scoreboard', {
      fetchImpl: async () => ({ ok: false, status: 503 }),
      retries: 1,
      timeoutMs: 50,
      waitMs: 1,
    }),
    /request failed: 503/,
  );
});
