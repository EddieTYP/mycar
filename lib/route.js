const { geocode } = require('./geocode');
const { route: orsRoute } = require('./providers/openrouteservice');
const { route: ghRoute } = require('./providers/graphhopper');

function isRetryableRouteError(err) {
  if (!err) return false;
  if (err.code === 'MISSING_API_KEY') return true;
  if (err.code === 'ETIMEDOUT') return true;
  if (err.status === 429) return true;
  if (typeof err.status === 'number' && err.status >= 500) return true;
  return false;
}

async function resolvePoint(label) {
  const matches = await geocode(label);
  if (!Array.isArray(matches) || matches.length === 0) {
    const err = new Error(`Unable to resolve point: ${label}`);
    err.code = 'POINT_NOT_FOUND';
    throw err;
  }

  return matches[0];
}

function toRoutingPoints(points) {
  return points.filter((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lon));
}

async function getRoute({ origin, destination, waypoints = [], departureTime }) {
  const [resolvedOrigin, resolvedDestination, ...rawWaypoints] = await Promise.all([
    resolvePoint(origin),
    resolvePoint(destination),
    ...waypoints.map((w) => resolvePoint(w)),
  ]);

  const resolvedWaypoints = toRoutingPoints(rawWaypoints);
  const req = {
    origin: resolvedOrigin,
    destination: resolvedDestination,
    waypoints: resolvedWaypoints,
    departureTime,
  };

  let route;
  try {
    route = await orsRoute(req);
  } catch (err) {
    if (isRetryableRouteError(err)) {
      const fallbackErr = new Error('Primary routing provider unavailable');
      fallbackErr.code = err.code;
      try {
        const fallback = await ghRoute(req);
        return {
          ...fallback,
          resolvedOrigin: resolvedOrigin.label,
          resolvedDestination: resolvedDestination.label,
          warnings: ['Primary routing provider failed, used GraphHopper fallback.'],
        };
      } catch (fallbackError) {
        const finalErr = new Error(fallbackError.message || 'No route provider available');
        finalErr.code = fallbackError.code || 'NO_ROUTE_PROVIDER';
        finalErr.status = fallbackError.status;
        finalErr.warnings = fallbackError.warnings || [];
        throw finalErr;
      }
    }

    if (err.code === 'ETIMEDOUT') {
      const timeoutErr = new Error('Route service timed out');
      timeoutErr.code = 'ROUTE_TIMEOUT';
      throw timeoutErr;
    }

    if (err.code === 'MISSING_API_KEY') {
      const noKeyErr = new Error('No route provider available');
      noKeyErr.code = 'NO_ROUTE_PROVIDER';
      throw noKeyErr;
    }

    throw err;
  }

  return {
    ...route,
    resolvedOrigin: resolvedOrigin.label,
    resolvedDestination: resolvedDestination.label,
    warnings: route.warnings || [],
  };
}

module.exports = { getRoute };
