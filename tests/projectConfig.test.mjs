import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('project is configured as a Vite React app', async () => {
  const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
  const indexHtml = await readFile('index.html', 'utf8');

  assert.equal(packageJson.scripts.dev, 'vite --host 127.0.0.1');
  assert.equal(packageJson.scripts.build, 'vite build');
  assert.ok(packageJson.dependencies.react);
  assert.ok(packageJson.dependencies['react-dom']);
  assert.match(indexHtml, /<title>世界杯比分预测<\/title>/);
  assert.match(indexHtml, /<div id="root"><\/div>/);
  assert.match(indexHtml, /src="\/src\/main.jsx"/);
});
