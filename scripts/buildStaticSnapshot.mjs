import { createClient } from '@supabase/supabase-js';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

import { buildStaticSnapshot } from '../src/staticSnapshot.mjs';
import { fetchWithTimeoutAndRetry } from '../src/supabaseData.mjs';

await loadLocalEnv();

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.');
}

const client = createClient(supabaseUrl, supabaseKey, {
  global: {
    fetch: (input, init) => fetchWithTimeoutAndRetry(input, init, {
      timeoutMs: 15000,
      retries: 2,
    }),
  },
});
const snapshot = await withRetry('build static snapshot', () => buildStaticSnapshot({ client }));
const outputUrl = new URL('../public/data-snapshot.json', import.meta.url);

await mkdir(new URL('../public/', import.meta.url), { recursive: true });
await writeFile(outputUrl, `${JSON.stringify(snapshot)}\n`);

console.log(`Wrote ${outputUrl.pathname}`);
console.log(`Snapshot: ${snapshot.matches.length} matches, ${Object.keys(snapshot.scoreOddsByMatch).length} odds matches, ${Object.keys(snapshot.aiRecommendationsByMatch).length} AI recommendation rows.`);

async function loadLocalEnv() {
  try {
    const envText = await readFile(new URL('../.env.local', import.meta.url), 'utf8');
    for (const line of envText.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
      const [key, ...valueParts] = trimmed.split('=');
      process.env[key] ||= valueParts.join('=');
    }
  } catch {
    // .env.local is optional; CI should use real environment variables.
  }
}

async function withRetry(label, fn, retries = 4) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === retries) break;
      console.warn(`${label} failed, retrying (${attempt + 1}/${retries}): ${error.message || error}`);
      await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
    }
  }
  throw lastError;
}
