const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const url = require('node:url');

const { geocode } = require('./lib/geocode');
const { getRoute } = require('./lib/route');

function loadEnvFile(filePath = path.join(__dirname, '.env')) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const content = fs.readFileSync(filePath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const eq = trimmed.indexOf('=');
    if (eq === -1) {
      continue;
    }

    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^"|"$/g, '');
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadEnvFile();

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
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
      if (!data) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(data));
      } catch {
        resolve({});
      }
    });

    req.on('error', reject);
  });
}

function serveStatic(req, res, pathname) {
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

function collectQueryParams(reqUrl) {
  return Object.fromEntries(new URL(reqUrl, `http://localhost`).searchParams.entries());
}

async function requestHandler(req, res) {
  const parsed = url.parse(req.url || '/', true);
  const pathname = parsed.pathname || '/';

  if (pathname === '/api/health' && req.method === 'GET') {
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === '/api/geocode' && req.method === 'GET') {
    const q = String(parsed.query.q || '').trim();
    if (q.length < 3) {
      return sendJson(res, 400, { ok: false, error: 'Query too short. Minimum 3 characters.' });
    }

    try {
      const results = await geocode(q);
      return sendJson(res, 200, { ok: true, provider: 'nominatim', results });
    } catch (err) {
      if (err.code === 'ETIMEDOUT') {
        return sendJson(res, 502, { ok: false, error: 'Unable to resolve address right now' });
      }
      return sendJson(res, 502, { ok: false, error: 'Geocode failed' });
    }
  }

  if (pathname === '/api/route' && req.method === 'POST') {
    const body = await parseBody(req);
    const { origin, destination, waypoints = [], departureTime } = body || {};

    if (!origin || typeof origin !== 'string') {
      return sendJson(res, 400, { ok: false, error: 'origin is required' });
    }

    if (!destination || typeof destination !== 'string') {
      return sendJson(res, 400, { ok: false, error: 'destination is required' });
    }

    if (!Array.isArray(waypoints)) {
      return sendJson(res, 400, { ok: false, error: 'waypoints must be an array' });
    }

    try {
      const route = await getRoute({
        origin,
        destination,
        waypoints,
        departureTime,
      });

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
    sendJson(res, 404, { ok: false, error: 'API endpoint not found' });
    return;
  }

  serveStatic(req, res, pathname);
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
