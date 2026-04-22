const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const url = require('node:url');
const crypto = require('node:crypto');

const { geocode } = require('./lib/geocode');
const { getRoute } = require('./lib/route');
const { parseCookies, createSessionValue, verifySessionValue, getAuthConfig } = require('./lib/auth');

function loadEnvFile(filePath = path.join(__dirname, '.env')) {
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^"|"$/g, '');
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile();

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

const PUBLIC_PATHS = new Set(['/login.html', '/login.js', '/style.css', '/config.js']);
const AUTH_COOKIE = 'mycar_session';

function sendJson(res, statusCode, payload, headers = {}) {
  const body = JSON.stringify(payload);
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value);
  }
  res.end(body);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) {
        req.destroy();
        reject(new Error('Request body too large'));
      }
    });

    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        resolve({});
      }
    });

    req.on('error', reject);
  });
}

function serveStatic(res, pathname) {
  let filePath = pathname === '/' ? '/index.html' : pathname;
  filePath = path.normalize(filePath);
  if (filePath.includes('..')) {
    sendJson(res, 400, { ok: false, error: 'Invalid path' });
    return;
  }

  const absPath = path.join(__dirname, filePath);
  fs.readFile(absPath, (err, content) => {
    if (err) {
      sendJson(res, 404, { ok: false, error: 'Not found' });
      return;
    }

    const ext = path.extname(absPath);
    res.statusCode = 200;
    res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
    res.end(content);
  });
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''), 'utf8');
  const b = Buffer.from(String(right || ''), 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function getSession(req) {
  const { sessionSecret } = getAuthConfig();
  const cookies = parseCookies(req.headers.cookie || '');
  return verifySessionValue(cookies[AUTH_COOKIE], sessionSecret);
}

function redirect(res, location) {
  res.statusCode = 302;
  res.setHeader('Location', location);
  res.end();
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${AUTH_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

function setSessionCookie(res, username) {
  const { sessionSecret } = getAuthConfig();
  const sessionValue = createSessionValue(username, sessionSecret);
  res.setHeader('Set-Cookie', `${AUTH_COOKIE}=${encodeURIComponent(sessionValue)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`);
}

function requireAuth(req, res, pathname) {
  const session = getSession(req);
  if (session) return session;

  if (pathname.startsWith('/api/')) {
    sendJson(res, 401, { ok: false, error: 'Login required' });
  } else {
    redirect(res, '/login.html');
  }
  return null;
}

async function handleLogin(req, res) {
  const { username, password } = await parseBody(req);
  const config = getAuthConfig();
  const normalizedUsername = String(username || '').trim();
  const expectedPassword = config.accounts[normalizedUsername];

  if (!Object.keys(config.accounts).length || !config.sessionSecret) {
    return sendJson(res, 500, { ok: false, error: 'Auth is not configured on the server' });
  }

  if (!expectedPassword || !safeEqual(password, expectedPassword)) {
    return sendJson(res, 401, { ok: false, error: 'Invalid username or password' });
  }

  setSessionCookie(res, normalizedUsername);
  return sendJson(res, 200, { ok: true, username: normalizedUsername });
}

async function requestHandler(req, res) {
  const parsed = url.parse(req.url || '/', true);
  const pathname = parsed.pathname || '/';

  if (pathname === '/api/health' && req.method === 'GET') {
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === '/api/login' && req.method === 'POST') {
    return handleLogin(req, res);
  }

  if (pathname === '/api/logout' && req.method === 'POST') {
    clearSessionCookie(res);
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === '/api/session' && req.method === 'GET') {
    const session = getSession(req);
    if (!session) return sendJson(res, 401, { ok: false, error: 'Login required' });
    return sendJson(res, 200, { ok: true, username: session.username });
  }

  if (pathname === '/login.html' && req.method === 'GET') {
    if (getSession(req)) return redirect(res, '/');
    return serveStatic(res, pathname);
  }

  if (PUBLIC_PATHS.has(pathname)) {
    return serveStatic(res, pathname);
  }

  const session = requireAuth(req, res, pathname);
  if (!session) return;

  if (pathname === '/api/geocode' && req.method === 'GET') {
    const q = String(parsed.query.q || '').trim();
    if (q.length < 3) return sendJson(res, 400, { ok: false, error: 'Query too short. Minimum 3 characters.' });

    try {
      const results = await geocode(q);
      return sendJson(res, 200, { ok: true, provider: 'nominatim', results });
    } catch (err) {
      if (err.code === 'ETIMEDOUT') return sendJson(res, 502, { ok: false, error: 'Unable to resolve address right now' });
      return sendJson(res, 502, { ok: false, error: 'Geocode failed' });
    }
  }

  if (pathname === '/api/route' && req.method === 'POST') {
    const body = await parseBody(req);
    const { origin, destination, waypoints = [], departureTime } = body || {};

    if (!origin || typeof origin !== 'string') return sendJson(res, 400, { ok: false, error: 'origin is required' });
    if (!destination || typeof destination !== 'string') return sendJson(res, 400, { ok: false, error: 'destination is required' });
    if (!Array.isArray(waypoints)) return sendJson(res, 400, { ok: false, error: 'waypoints must be an array' });

    try {
      const route = await getRoute({ origin, destination, waypoints, departureTime });
      return sendJson(res, 200, {
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
        err.code === 'GEOCODE_TIMEOUT'
          ? 'Unable to resolve address right now'
          : err.code === 'ROUTE_TIMEOUT'
            ? 'Route service timed out'
            : err.code === 'NO_ROUTE_PROVIDER' || err.code === 'MISSING_API_KEY'
              ? 'No route provider available'
              : 'Unable to calculate route';

      if (err.code === 'GEOCODE_TIMEOUT' || err.code === 'ROUTE_TIMEOUT') {
        return sendJson(res, 502, { ok: false, error: message });
      }
      if (err.code === 'POINT_NOT_FOUND') {
        return sendJson(res, 422, { ok: false, error: message });
      }
      return sendJson(res, 500, { ok: false, error: message });
    }
  }

  if (pathname.startsWith('/api/')) {
    return sendJson(res, 404, { ok: false, error: 'API endpoint not found' });
  }

  return serveStatic(res, pathname);
}

const port = Number(process.env.PORT) || 8000;
const server = http.createServer((req, res) => {
  requestHandler(req, res).catch((err) => {
    sendJson(res, 500, { ok: false, error: err.message || 'Internal server error' });
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Listening on http://127.0.0.1:${port}`);
});
