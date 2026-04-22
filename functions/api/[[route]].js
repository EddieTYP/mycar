const AUTH_COOKIE = 'mycar_session';
const geocodeCache = new Map();

function json(payload, init = {}) {
  return new Response(JSON.stringify(payload), {
    ...init,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...(init.headers || {}),
    },
  });
}

function parseCookies(header = '') {
  return String(header)
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((acc, part) => {
      const idx = part.indexOf('=');
      if (idx === -1) return acc;
      acc[part.slice(0, idx)] = decodeURIComponent(part.slice(idx + 1));
      return acc;
    }, {});
}

function toBase64Url(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '==='.slice((normalized.length + 3) % 4);
  const binary = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

async function sign(payload, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function createSessionValue(username, secret) {
  const payload = toBase64Url(JSON.stringify({ username }));
  const signature = await sign(payload, secret);
  return `${payload}.${signature}`;
}

async function verifySessionValue(value, secret) {
  if (!value || !secret) return null;
  const [payload, signature] = String(value).split('.');
  if (!payload || !signature) return null;
  const expected = await sign(payload, secret);
  if (expected !== signature) return null;
  try {
    const data = JSON.parse(fromBase64Url(payload));
    if (!data?.username) return null;
    return data;
  } catch {
    return null;
  }
}

async function parseBody(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function getAuthAccounts(env) {
  const raw = String(env.AUTH_ACCOUNTS_JSON || '').trim();
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return Object.fromEntries(
          Object.entries(parsed)
            .map(([username, password]) => [String(username).trim(), String(password)])
            .filter(([username, password]) => username && password)
        );
      }
    } catch {
      return {};
    }
  }

  const username = String(env.AUTH_USERNAME || '').trim();
  const password = String(env.AUTH_PASSWORD || '');
  if (!username || !password) return {};
  return { [username]: password };
}

function getAuthConfig(env) {
  return {
    accounts: getAuthAccounts(env),
    sessionSecret: String(env.SESSION_SECRET || '').trim(),
  };
}

async function getSession(request, env) {
  const config = getAuthConfig(env);
  const cookies = parseCookies(request.headers.get('cookie') || '');
  return verifySessionValue(cookies[AUTH_COOKIE], config.sessionSecret);
}

async function fetchJson(url, options = {}, timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
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

async function geocode(query) {
  const safeQuery = String(query || '').trim().toLowerCase();
  if (!safeQuery) return [];
  const cached = geocodeCache.get(safeQuery);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '5');

  const data = await fetchJson(url.toString(), {
    headers: {
      'User-Agent': 'mycar-route-planner/1.0',
      Accept: 'application/json',
    },
  }, 4000);

  const results = Array.isArray(data)
    ? data.map((item) => ({
        label: item.display_name,
        lat: Number(item.lat),
        lon: Number(item.lon),
      })).filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lon))
    : [];

  geocodeCache.set(safeQuery, { value: results, expiresAt: Date.now() + 15 * 60 * 1000 });
  return results;
}

function decodePolyline(encoded, precision = 5) {
  if (typeof encoded !== 'string' || !encoded) return null;
  let index = 0;
  let lat = 0;
  let lng = 0;
  const coordinates = [];
  const factor = Math.pow(10, precision);

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length + 1);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);

    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length + 1);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);

    coordinates.push([lat / factor, lng / factor]);
  }

  return coordinates.length >= 2 ? coordinates : null;
}

function normalizeRouteGeometry(geometry) {
  if (typeof geometry === 'string') return decodePolyline(geometry);
  const coords = geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length === 0) return null;
  const normalized = coords
    .filter((point) => Array.isArray(point) && point.length >= 2)
    .map(([lon, lat]) => [Number(lat), Number(lon)])
    .filter(([lat, lon]) => Number.isFinite(lat) && Number.isFinite(lon));
  return normalized.length >= 2 ? normalized : null;
}

function normalizeOrsResponse(data) {
  const route = data?.routes?.[0] || data?.features?.[0] || null;
  const summary = route?.summary || route?.properties?.summary || route?.properties?.segments?.[0];
  if (!summary || !Number.isFinite(summary.distance) || !Number.isFinite(summary.duration)) return null;
  return {
    provider: 'openrouteservice',
    distanceKm: summary.distance / 1000,
    durationMinutes: summary.duration / 60,
    polyline: normalizeRouteGeometry(data?.routes?.[0]?.geometry || data?.features?.[0]?.geometry || null),
    warnings: Array.isArray(data?.metadata?.warnings) ? data.metadata.warnings : [],
  };
}

async function orsRoute(env, { origin, destination, waypoints }) {
  const key = env.ORS_API_KEY;
  if (!key) {
    const err = new Error('Missing ORS API key');
    err.code = 'MISSING_API_KEY';
    throw err;
  }
  const points = [origin, ...waypoints, destination].map((p) => [p.lon, p.lat]);
  const data = await fetchJson('https://api.openrouteservice.org/v2/directions/driving-car', {
    method: 'POST',
    headers: {
      Authorization: key,
      'Content-Type': 'application/json',
      Accept: 'application/json, application/geo+json',
    },
    body: JSON.stringify({ coordinates: points, language: 'en' }),
  }, 12000);
  const normalized = normalizeOrsResponse(data);
  if (!normalized) {
    const err = new Error('Unexpected ORS response format');
    err.code = 'UPSTREAM_PARSE_ERROR';
    throw err;
  }
  return normalized;
}

function normalizeGraphhopperResponse(data) {
  const path = data?.paths?.[0];
  if (!path || !Number.isFinite(path.distance) || !Number.isFinite(path.time)) return null;
  return {
    provider: 'graphhopper',
    distanceKm: path.distance / 1000,
    durationMinutes: path.time / 60000,
    polyline: normalizeRouteGeometry(path.points || null),
    warnings: [],
  };
}

async function graphhopperRoute(env, { origin, destination, waypoints }) {
  const key = env.GRAPHHOPPER_API_KEY;
  if (!key) {
    const err = new Error('Missing GraphHopper API key');
    err.code = 'MISSING_API_KEY';
    throw err;
  }
  const url = new URL('https://graphhopper.com/api/1/route');
  url.searchParams.set('vehicle', 'car');
  url.searchParams.set('key', key);
  url.searchParams.set('instructions', 'false');
  url.searchParams.set('points_encoded', 'false');
  for (const point of [origin, ...waypoints, destination]) {
    url.searchParams.append('point', `${point.lat},${point.lon}`);
  }
  const data = await fetchJson(url.toString(), { headers: { Accept: 'application/json' } }, 12000);
  const normalized = normalizeGraphhopperResponse(data);
  if (!normalized) {
    const err = new Error('Unexpected GraphHopper response format');
    err.code = 'UPSTREAM_PARSE_ERROR';
    throw err;
  }
  return normalized;
}

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
  if (!matches.length) {
    const err = new Error(`Unable to resolve point: ${label}`);
    err.code = 'POINT_NOT_FOUND';
    throw err;
  }
  return matches[0];
}

async function getRoute(env, { origin, destination, waypoints = [] }) {
  const [resolvedOrigin, resolvedDestination, ...rawWaypoints] = await Promise.all([
    resolvePoint(origin),
    resolvePoint(destination),
    ...waypoints.map((w) => resolvePoint(w)),
  ]);
  const req = {
    origin: resolvedOrigin,
    destination: resolvedDestination,
    waypoints: rawWaypoints.filter((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lon)),
  };

  try {
    const primary = await orsRoute(env, req);
    return { ...primary, resolvedOrigin: resolvedOrigin.label, resolvedDestination: resolvedDestination.label };
  } catch (err) {
    if (!isRetryableRouteError(err)) throw err;
    const fallback = await graphhopperRoute(env, req);
    return {
      ...fallback,
      resolvedOrigin: resolvedOrigin.label,
      resolvedDestination: resolvedDestination.label,
      warnings: ['Primary routing provider failed, used GraphHopper fallback.'],
    };
  }
}

function authError() {
  return json({ ok: false, error: 'Login required' }, { status: 401 });
}

export async function onRequest(context) {
  const { request, env, params } = context;
  const path = Array.isArray(params.route) ? params.route.join('/') : (params.route || '');

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }

  if (path === 'health' && request.method === 'GET') {
    return json({ ok: true });
  }

  if (path === 'login' && request.method === 'POST') {
    const body = await parseBody(request);
    const config = getAuthConfig(env);
    const normalizedUsername = String(body.username || '').trim();
    const expectedPassword = config.accounts[normalizedUsername];
    if (!Object.keys(config.accounts).length || !config.sessionSecret) {
      return json({ ok: false, error: 'Auth is not configured on the server' }, { status: 500 });
    }
    if (!expectedPassword || String(body.password || '') !== expectedPassword) {
      return json({ ok: false, error: 'Invalid username or password' }, { status: 401 });
    }
    const sessionValue = await createSessionValue(normalizedUsername, config.sessionSecret);
    return json({ ok: true, username: normalizedUsername }, {
      headers: {
        'Set-Cookie': `${AUTH_COOKIE}=${encodeURIComponent(sessionValue)}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=604800`,
      },
    });
  }

  if (path === 'logout' && request.method === 'POST') {
    return json({ ok: true }, {
      headers: {
        'Set-Cookie': `${AUTH_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0`,
      },
    });
  }

  const session = await getSession(request, env);
  if (!session) return authError();

  if (path === 'session' && request.method === 'GET') {
    return json({ ok: true, username: session.username });
  }

  if (path === 'geocode' && request.method === 'GET') {
    const q = new URL(request.url).searchParams.get('q')?.trim() || '';
    if (q.length < 3) return json({ ok: false, error: 'Query too short. Minimum 3 characters.' }, { status: 400 });
    try {
      const results = await geocode(q);
      return json({ ok: true, provider: 'nominatim', results });
    } catch (err) {
      const message = err.code === 'ETIMEDOUT' ? 'Unable to resolve address right now' : 'Geocode failed';
      return json({ ok: false, error: message }, { status: 502 });
    }
  }

  if (path === 'route' && request.method === 'POST') {
    const body = await parseBody(request);
    const { origin, destination, waypoints = [] } = body || {};
    if (!origin || typeof origin !== 'string') return json({ ok: false, error: 'origin is required' }, { status: 400 });
    if (!destination || typeof destination !== 'string') return json({ ok: false, error: 'destination is required' }, { status: 400 });
    if (!Array.isArray(waypoints)) return json({ ok: false, error: 'waypoints must be an array' }, { status: 400 });

    try {
      const route = await getRoute(env, { origin, destination, waypoints });
      return json({
        ok: true,
        provider: route.provider,
        distanceKm: route.distanceKm,
        durationMinutes: route.durationMinutes,
        polyline: route.polyline ?? null,
        resolvedOrigin: route.resolvedOrigin,
        resolvedDestination: route.resolvedDestination,
        warnings: route.warnings || [],
      });
    } catch (err) {
      const message =
        err.code === 'POINT_NOT_FOUND' ? 'Unable to calculate route' :
        err.code === 'ETIMEDOUT' ? 'Route service timed out' :
        err.code === 'MISSING_API_KEY' ? 'No route provider available' :
        'Unable to calculate route';
      const status = err.code === 'POINT_NOT_FOUND' ? 422 : (err.code === 'ETIMEDOUT' ? 502 : 500);
      return json({ ok: false, error: message }, { status });
    }
  }

  return json({ ok: false, error: 'API endpoint not found' }, { status: 404 });
}
