const { fetchJson } = require('../http');

const GH_TIMEOUT_MS = 12000;

function normalizeGraphhopperResponse(data) {
  const path = data?.paths?.[0];
  if (!path || !Number.isFinite(path.distance) || !Number.isFinite(path.time)) {
    return null;
  }

  return {
    provider: 'graphhopper',
    distanceKm: path.distance / 1000,
    durationMinutes: path.time / 60000,
    polyline: path.points || null,
    warnings: [],
  };
}

async function route({ origin, destination, waypoints }) {
  const key = process.env.GRAPHHOPPER_API_KEY;
  if (!key) {
    const err = new Error('Missing GraphHopper API key');
    err.code = 'MISSING_API_KEY';
    throw err;
  }

  const url = new URL('https://graphhopper.com/api/1/route');
  const points = [origin, ...waypoints, destination];
  url.searchParams.set('vehicle', 'car');
  url.searchParams.set('key', key);
  url.searchParams.set('instructions', 'false');
  url.searchParams.set('points_encoded', 'false');
  for (const point of points) {
    url.searchParams.append('point', `${point.lat},${point.lon}`);
  }

  const data = await fetchJson(url.toString(), {
    headers: {
      Accept: 'application/json',
    },
  }, GH_TIMEOUT_MS);

  const normalized = normalizeGraphhopperResponse(data);
  if (!normalized) {
    const err = new Error('Unexpected GraphHopper response format');
    err.code = 'UPSTREAM_PARSE_ERROR';
    throw err;
  }

  return normalized;
}

module.exports = { route };
