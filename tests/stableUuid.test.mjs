import test from 'node:test';
import assert from 'node:assert/strict';

import { deterministicUuid } from '../src/stableUuid.mjs';

const uuidV4LikePattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/;

test('deterministicUuid returns stable valid UUID strings for strategy ids', () => {
  const seeds = [
    'system:tem_consensus_n3_cap7',
    'system:context_poisson_ev_v2',
    'system:tem_draw_anchor_3_max5_5',
    'system:market_consensus_sources',
  ];

  for (const seed of seeds) {
    const id = deterministicUuid(seed);
    assert.match(id, uuidV4LikePattern);
    assert.equal(deterministicUuid(seed), id);
  }
});
