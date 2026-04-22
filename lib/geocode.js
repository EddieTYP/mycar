const { fetchJson } = require('./http');
const { get, set } = require('./cache');

const NOMINATIM_TIMEOUT_MS = 4000;
const NOMINATIM_CACHE_TTL_MS = 15 * 60 * 1000;

async function geocode(query) {
  const safeQuery = String(query || '').trim().toLowerCase();
  if (!safeQuery) {
    return [];
  }

  const cacheKey = `geocode:${safeQuery}`;
  const cached = get(cacheKey);
  if (cached) {
    return cached;
  }

  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '5');

  const data = await fetchJson(url.toString(), {
    headers: {
      'User-Agent': 'mycar-route-planner/1.0',
      Accept: 'application/json',
    },
  }, NOMINATIM_TIMEOUT_MS);

  const results = Array.isArray(data)
    ? data.map((item) => ({
        label: item.display_name,
        lat: Number(item.lat),
        lon: Number(item.lon),
      })).filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lon))
    : [];

  set(cacheKey, results, NOMINATIM_CACHE_TTL_MS);
  return results;
}

module.exports = { geocode };
