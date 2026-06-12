export async function fetchJsonWithRetry(url, options = {}) {
  const {
    fetchImpl = fetch,
    retries = 3,
    timeoutMs = 20000,
    waitMs = 1000,
  } = options;

  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (!response.ok) throw new Error(`request failed: ${response.status}`);
      return response.json();
    } catch (error) {
      lastError = error;
      if (attempt === retries) break;
      await wait(waitMs * (attempt + 1));
    }
  }

  throw lastError;
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
