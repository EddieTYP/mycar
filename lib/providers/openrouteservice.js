const { fetchJson } = require('../http');
const { normalizeRouteGeometry } = require('../geometry');

const ORS_TIMEOUT_MS = 12000;

function isTimeoutError(err) {
  return err?.code === 'ETIMEDOUT';
}

function normalizeOrsResponse(data) {
  const route = data?.routes?.[0] || data?.features?.[0] || null;
  const summary = route?.summary || route?.properties?.summary || route?.properties?.segments?.[0];

  if (!summary || !Number.isFinite(summary.distance) || !Number.isFinite(summary.duration)) {
    return null;
  }

  const distanceKm = summary.distance / 1000;
  const durationMinutes = summary.duration / 60;
  const polyline = normalizeRouteGeometry(data?.routes?.[0]?.geometry || data?.features?.[0]?.geometry || null);

  return {
    provider: 'openrouteservice',
    distanceKm,
    durationMinutes,
    polyline,
    warnings: Array.isArray(data?.metadata?.warnings) ? data.metadata.warnings : [],
  };
}

async function route({ origin, destination, waypoints }) {
  const key = process.env.ORS_API_KEY;
  if (!key) {
    const err = new Error('Missing ORS API key');
    err.code = 'MISSING_API_KEY';
    throw err;
  }

  const points = [origin, ...waypoints, destination].map((p) => [p.lon, p.lat]);
  const body = {
    coordinates: points,
    language: 'en',
  };

  const data = await fetchJson('https://api.openrouteservice.org/v2/directions/driving-car', {
    method: 'POST',
    headers: {
      Authorization: key,
      'Content-Type': 'application/json',
      Accept: 'application/json, application/geo+json',
    },
    body: JSON.stringify(body),
  }, ORS_TIMEOUT_MS);

  const normalized = normalizeOrsResponse(data);
  if (!normalized) {
    const err = new Error('Unexpected ORS response format');
    if (isTimeoutError(data)) {
      err.code = 'ETIMEDOUT';
    }
    err.code = err.code || 'UPSTREAM_PARSE_ERROR';
    throw err;
  }

  return normalized;
}

module.exports = { route };
