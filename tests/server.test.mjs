import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { createRequestHandler } from '../server.mjs';

test('web service handler proxies api requests to the configured D1 target', async () => {
  const handler = createRequestHandler({
    distDir: '/missing-dist',
    apiTarget: 'https://worker.example.com',
    fetchImpl: async (url, init) => {
      assert.equal(url, 'https://worker.example.com/api/groups/demo/state?x=1');
      assert.equal(init.method, 'POST');
      assert.equal(init.headers.get('content-type'), 'application/json');
      assert.equal(await init.text(), '{"ok":true}');
      return new Response(JSON.stringify({ proxied: true }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  const response = await handler(new Request('https://app.example.com/api/groups/demo/state?x=1', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ok: true }),
  }));

  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { proxied: true });
  assert.equal(response.headers.get('access-control-allow-origin'), '*');
});

test('web service handler serves built assets and falls back to index html', async () => {
  const distDir = await mkdtemp(join(tmpdir(), 'worldcup-dist-'));
  try {
    await mkdir(join(distDir, 'assets'));
    await writeFile(join(distDir, 'index.html'), '<div id="root"></div>', 'utf8');
    await writeFile(join(distDir, 'assets', 'app.js'), 'console.log("ok")', 'utf8');

    const handler = createRequestHandler({ distDir, apiTarget: 'https://worker.example.com' });
    const assetResponse = await handler(new Request('https://app.example.com/assets/app.js'));
    const routeResponse = await handler(new Request('https://app.example.com/?group=demo'));

    assert.equal(assetResponse.status, 200);
    assert.equal(assetResponse.headers.get('content-type'), 'text/javascript; charset=utf-8');
    assert.equal(await assetResponse.text(), 'console.log("ok")');
    assert.equal(routeResponse.status, 200);
    assert.equal(routeResponse.headers.get('content-type'), 'text/html; charset=utf-8');
    assert.equal(await routeResponse.text(), '<div id="root"></div>');
  } finally {
    await rm(distDir, { recursive: true, force: true });
  }
});
