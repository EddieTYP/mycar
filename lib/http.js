async function fetchJson(url, options = {}, timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
    });

    if (!res.ok) {
      const err = new Error(`Upstream request failed: ${res.status} ${res.statusText}`);
      err.status = res.status;
      throw err;
    }

    return await res.json();
  } catch (err) {
    if (err.name === 'AbortError') {
      const timeoutErr = new Error(`Request timed out after ${timeoutMs}ms`);
      timeoutErr.code = 'ETIMEDOUT';
      throw timeoutErr;
    }

    throw err;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { fetchJson };
