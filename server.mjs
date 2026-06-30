import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, normalize, resolve } from 'node:path';

const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'content-type',
};

export function createRequestHandler({
  distDir = resolve('dist'),
  apiTarget = process.env.D1_PROXY_TARGET || process.env.WORKER_API_URL || '',
  fetchImpl = fetch,
} = {}) {
  const normalizedDistDir = resolve(distDir);
  const normalizedApiTarget = String(apiTarget || '').replace(/\/+$/, '');

  return async function handleRequest(request) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders });
      }
      return proxyApiRequest({ request, url, apiTarget: normalizedApiTarget, fetchImpl });
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return textResponse('Method not allowed', 405);
    }

    return serveStaticRequest({ request, url, distDir: normalizedDistDir });
  };
}

export async function startServer({
  port = Number(process.env.PORT) || 3000,
  host = process.env.HOST || '0.0.0.0',
  handler = createRequestHandler(),
} = {}) {
  const server = createServer(async (incoming, outgoing) => {
    try {
      const origin = `http://${incoming.headers.host || `${host}:${port}`}`;
      const request = new Request(new URL(incoming.url || '/', origin), {
        method: incoming.method,
        headers: incoming.headers,
        body: incoming.method === 'GET' || incoming.method === 'HEAD' ? undefined : incoming,
        duplex: 'half',
      });
      await writeNodeResponse(outgoing, await handler(request));
    } catch (error) {
      await writeNodeResponse(outgoing, textResponse(error?.message || 'Server error', 500));
    }
  });

  await new Promise((resolveListen) => server.listen(port, host, resolveListen));
  console.log(`worldcup-predictor web service listening on ${host}:${port}`);
  return server;
}

async function proxyApiRequest({ request, url, apiTarget, fetchImpl }) {
  if (!apiTarget) return jsonResponse({ error: 'api_target_missing' }, 503);

  const targetUrl = `${apiTarget}${url.pathname}${url.search}`;
  const bodyBuffer = request.method === 'GET' || request.method === 'HEAD'
    ? undefined
    : await request.arrayBuffer();
  const proxyInit = {
    method: request.method,
    headers: new Headers(request.headers),
    body: bodyBuffer,
    duplex: 'half',
    text: async () => (bodyBuffer ? new TextDecoder().decode(bodyBuffer) : ''),
  };
  proxyInit.headers.delete('host');

  const upstream = await fetchImpl(targetUrl, proxyInit);
  const headers = new Headers(upstream.headers);
  for (const [key, value] of Object.entries(corsHeaders)) headers.set(key, value);
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}

async function serveStaticRequest({ request, url, distDir }) {
  const pathname = decodeURIComponent(url.pathname);
  const requestedPath = pathname === '/' ? '/index.html' : pathname;
  const filePath = safeJoin(distDir, requestedPath);
  const fallbackPath = join(distDir, 'index.html');

  const file = await readFileOrNull(filePath);
  if (file) {
    return fileResponse(file, contentTypeFor(filePath), request.method);
  }

  const index = await readFileOrNull(fallbackPath);
  if (!index) return textResponse('Not found', 404);
  return fileResponse(index, 'text/html; charset=utf-8', request.method);
}

function safeJoin(root, pathname) {
  const relative = normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, '').replace(/^[/\\]+/, '');
  const filePath = resolve(root, relative);
  return filePath.startsWith(root) ? filePath : join(root, 'index.html');
}

async function readFileOrNull(filePath) {
  try {
    return await readFile(filePath);
  } catch {
    return null;
  }
}

function fileResponse(file, contentType, method) {
  return new Response(method === 'HEAD' ? null : file, {
    status: 200,
    headers: {
      'content-type': contentType,
      'cache-control': contentType.startsWith('text/html') ? 'no-cache' : 'public, max-age=31536000, immutable',
    },
  });
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      'content-type': 'application/json; charset=utf-8',
    },
  });
}

function textResponse(message, status = 200) {
  return new Response(message, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}

async function writeNodeResponse(outgoing, response) {
  outgoing.writeHead(response.status, Object.fromEntries(response.headers.entries()));
  if (response.body) {
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      outgoing.write(Buffer.from(value));
    }
  }
  outgoing.end();
}

function contentTypeFor(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
  if (filePath.endsWith('.svg')) return 'image/svg+xml';
  if (filePath.endsWith('.png')) return 'image/png';
  if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) return 'image/jpeg';
  if (filePath.endsWith('.webp')) return 'image/webp';
  return 'application/octet-stream';
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await startServer();
}
