# Nominatim + openrouteservice/GraphHopper Migration Plan

> For Hermes: implement this plan in the `mycar` repo, keeping the app lightweight, Google-free, and easy to swap providers later.

Goal: Replace Google Maps JavaScript / Places / Directions with a lightweight backend proxy that uses Nominatim for place search and a hosted routing provider (openrouteservice first, GraphHopper fallback), while preserving the Hong Kong tunnel/toll + Tesla charging budget logic.

Architecture: Keep the current app as a static single-page frontend, but add a thin Node backend that owns all third-party API calls. Frontend talks only to `/api/geocode` and `/api/route`. Backend normalizes provider differences, adds timeout/cache/fallback logic, and returns a stable schema to the frontend.

Tech Stack:
- Frontend: HTML/CSS/Vanilla JS
- Backend: Node.js + Express (thin proxy)
- Geocoding: Nominatim
- Routing: openrouteservice hosted (primary), GraphHopper hosted (fallback)
- Optional map rendering later: Leaflet or MapLibre

---

## Current repo snapshot

Files currently in use:
- `index.html`
- `app.js`
- `style.css`
- `README.md`

Current Google-coupled code:
- `index.html:97` loads Google Maps JS API
- `app.js:1-3` defines Google global state and Places options
- `app.js:16-31` initializes `google.maps.*` objects and autocomplete
- `app.js:123-170` uses `DirectionsService.route()` for outbound/return routing

Migration target:
- remove all runtime dependence on Google Maps JS API
- preserve current UI flow and pricing logic
- replace map pane with route summary cards first
- keep room for later Leaflet/MapLibre route drawing if needed

---

## API contract to implement

### `GET /api/geocode?q=<query>`

Response shape:

```json
{
  "ok": true,
  "provider": "nominatim",
  "results": [
    {
      "label": "Central, Hong Kong",
      "lat": 22.2818,
      "lon": 114.1582
    }
  ]
}
```

Rules:
- reject queries shorter than 3 chars
- max 5 results
- normalize labels to a single `label` field for frontend use
- cache by raw query string

### `POST /api/route`

Request shape:

```json
{
  "origin": "Central, Hong Kong",
  "destination": "Sha Tin, Hong Kong",
  "waypoints": ["Cross-Harbour Tunnel"],
  "departureTime": "2026-04-22T08:30:00+08:00"
}
```

Response shape:

```json
{
  "ok": true,
  "provider": "openrouteservice",
  "distanceKm": 17.2,
  "durationMinutes": 27,
  "polyline": null,
  "resolvedOrigin": "Central, Hong Kong",
  "resolvedDestination": "Sha Tin, Hong Kong",
  "warnings": []
}
```

Rules:
- backend may geocode textual waypoints first
- if primary provider fails/429s/times out, retry once using GraphHopper
- frontend must not care which provider won

---

## Task 1: Add provider config and backend entrypoint

Objective: create a thin backend process that can serve static files and future API endpoints.

Files:
- Create: `server.js`
- Create: `.env.example`
- Modify: `README.md`

Step 1: Create `.env.example`

```env
PORT=8000
ORS_API_KEY=your_openrouteservice_key_here
GRAPHHOPPER_API_KEY=your_graphhopper_key_here
```

Step 2: Create `server.js` with minimal static server + health endpoint

```js
const express = require('express');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(__dirname));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

const port = process.env.PORT || 8000;
app.listen(port, () => {
  console.log(`Listening on http://127.0.0.1:${port}`);
});
```

Step 3: Update `README.md` setup section to run Node server instead of opening raw HTML.

Step 4: Verify

Run:
```bash
node server.js
curl http://127.0.0.1:8000/api/health
```

Expected:
- server starts
- health endpoint returns `{"ok":true}`

---

## Task 2: Add backend geocoding service wrapper

Objective: isolate Nominatim behind a small reusable module.

Files:
- Create: `lib/geocode.js`
- Modify: `server.js`

Step 1: Create `lib/geocode.js`

Responsibilities:
- `geocode(query)`
- call Nominatim with `format=jsonv2`, `limit=5`, `countrycodes=hk`
- return normalized array of `{ label, lat, lon }`

Suggested shape:

```js
async function geocode(query) {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '5');
  url.searchParams.set('countrycodes', 'hk');

  const res = await fetch(url, {
    headers: { 'User-Agent': 'mycar-route-planner/1.0' }
  });

  if (!res.ok) throw new Error(`Nominatim failed: ${res.status}`);
  const data = await res.json();
  return data.map(row => ({
    label: row.display_name,
    lat: Number(row.lat),
    lon: Number(row.lon)
  }));
}

module.exports = { geocode };
```

Step 2: Add `/api/geocode` route in `server.js`

Rules:
- reject empty/short queries
- return `{ ok: true, provider: 'nominatim', results }`
- return 400 for bad query, 502 for upstream failures

Step 3: Verify

Run:
```bash
curl 'http://127.0.0.1:8000/api/geocode?q=Central%20Hong%20Kong'
```

Expected:
- up to 5 normalized results
- no raw Nominatim fields leaked to frontend

---

## Task 3: Add in-memory caching + timeout helpers

Objective: make public/hosted endpoints more usable without adding heavy infrastructure.

Files:
- Create: `lib/cache.js`
- Create: `lib/http.js`
- Modify: `lib/geocode.js`

Step 1: Create `lib/cache.js`

Requirements:
- simple `Map`
- `get(key)` + `set(key, value, ttlMs)`
- expired entries removed lazily

Step 2: Create `lib/http.js`

Requirements:
- `fetchJson(url, options, timeoutMs)`
- use `AbortController`
- throw descriptive error on timeout

Step 3: Use cache + timeout in `lib/geocode.js`

Rules:
- geocode TTL: 15 minutes
- timeout: 4 seconds
- cache key: `geocode:${query.trim().toLowerCase()}`

Step 4: Verify

- first request succeeds normally
- second identical request should hit cache (log this during development)

---

## Task 4: Add routing provider adapters

Objective: create one adapter per provider so fallback is easy and frontend stays provider-agnostic.

Files:
- Create: `lib/providers/openrouteservice.js`
- Create: `lib/providers/graphhopper.js`
- Create: `lib/route.js`

Step 1: Create `lib/providers/openrouteservice.js`

Responsibilities:
- accept origin/destination/waypoints as lat/lon pairs
- call hosted openrouteservice Directions endpoint
- normalize to:

```js
{
  provider: 'openrouteservice',
  distanceKm,
  durationMinutes,
  polyline,
  warnings: []
}
```

Step 2: Create `lib/providers/graphhopper.js`

Responsibilities:
- same normalized return shape
- use as fallback

Step 3: Create `lib/route.js`

Responsibilities:
- geocode origin/destination/waypoints via `geocode()`
- try openrouteservice first
- on timeout / 429 / 5xx, try GraphHopper
- return first success

Pseudo-flow:

```js
async function getRoute({ origin, destination, waypoints }) {
  const resolved = await Promise.all([
    geocode(origin),
    geocode(destination),
    ...waypoints.map(geocode)
  ]);

  const primary = await tryOpenRouteService(...).catch(e => null);
  if (primary) return primary;

  return tryGraphHopper(...);
}
```

Step 4: Verify with a real route

Run:
```bash
curl -X POST http://127.0.0.1:8000/api/route \
  -H 'Content-Type: application/json' \
  -d '{"origin":"Central, Hong Kong","destination":"Sha Tin, Hong Kong","waypoints":[]}'
```

Expected:
- `distanceKm > 0`
- `durationMinutes > 0`
- `provider` present

---

## Task 5: Add `/api/route` endpoint in backend

Objective: expose one stable route API to the frontend.

Files:
- Modify: `server.js`
- Modify: `lib/route.js`

Step 1: Add route validation in `server.js`

Rules:
- `origin` required
- `destination` required
- `waypoints` optional array
- `departureTime` optional passthrough for future use

Step 2: Return normalized JSON only

Example:

```js
res.json({
  ok: true,
  provider: route.provider,
  distanceKm: route.distanceKm,
  durationMinutes: route.durationMinutes,
  polyline: route.polyline ?? null,
  resolvedOrigin: route.resolvedOrigin,
  resolvedDestination: route.resolvedDestination,
  warnings: route.warnings || []
});
```

Step 3: Map upstream failures to user-safe messages

Examples:
- geocode timeout -> `Unable to resolve address right now`
- routing timeout -> `Route service timed out`
- both providers fail -> `No route provider available`

---

## Task 6: Remove Google Maps dependency from frontend bootstrap

Objective: make the page load without Google JS.

Files:
- Modify: `index.html`
- Modify: `app.js`

Step 1: Remove Google script tag from `index.html`

Delete:
```html
<script src="https://maps.googleapis.com/maps/api/js?..." async defer></script>
```

Step 2: Remove Google-specific globals from `app.js`

Delete/replace:
- `let map, ds, drGo, drBack;`
- `acOptions`
- `google.maps.DirectionsService`
- `google.maps.DirectionsRenderer`
- `google.maps.places.Autocomplete`

Step 3: Replace `initApp()` with plain DOM setup

Keep only:
- initialize start time default
- bind input listeners
- render tunnel buttons
- maybe render empty route summary state

Step 4: Verify

- page loads with no JS errors
- inputs still render
- tunnel buttons still render

---

## Task 7: Replace autocomplete with lightweight suggestion dropdown

Objective: keep place lookup usable without Google Places.

Files:
- Modify: `index.html`
- Modify: `app.js`
- Modify: `style.css`

Step 1: Add suggestion container per input group

Example HTML pattern:

```html
<div class="input-group">
  <input class="node-input" ...>
  <div class="suggestions"></div>
</div>
```

Step 2: In `app.js`, add debounced suggestion lookup

Rules:
- debounce 400ms
- minimum 3 chars
- fetch `/api/geocode`
- render top 3-5 results
- click suggestion fills the input value
- input still allows manual submission if user skips suggestion

Step 3: Add CSS for dropdown list

Need styles for:
- `.suggestions`
- `.suggestion-item`
- hover/active state
- mobile-safe spacing

Step 4: Verify

- typing `Central` shows suggestions
- clicking one fills the input
- no request spam on every keystroke

---

## Task 8: Replace Google route calculation in `calculate()`

Objective: drive the budget UI from backend route data instead of Google Directions API.

Files:
- Modify: `app.js`

Step 1: Preserve existing pricing logic

Keep:
- `getSelectedDepartureTime()`
- `getToll()`
- charging rate parsing from `#car-model`
- `updateUI()`

Step 2: Replace route fetch logic

Instead of `ds.route(...)`, call:

```js
const res = await fetch('/api/route', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    origin: locs[0],
    destination: locs[locs.length - 1],
    waypoints: [...selectedTunnelLocations, ...locs.slice(1, -1)],
    departureTime: time.toISOString()
  })
});
```

Step 3: For return mode
- reverse locations
- calculate return trip separately
- continue using `backTime` to compute return toll timing

Step 4: Update UI from normalized response
- `km` from `distanceKm`
- `sec` from `durationMinutes * 60`
- total cost unchanged formula

Step 5: Verify
- one-way trip updates numbers
- return mode updates combined totals
- toll logic still depends on selected departure/return time

---

## Task 9: Replace map pane with route summary panel first

Objective: keep the app lightweight now; defer full map drawing.

Files:
- Modify: `index.html`
- Modify: `app.js`
- Modify: `style.css`

Step 1: Repurpose `#map` into a route-summary container

Display:
- provider name
- outbound distance/time
- return distance/time if enabled
- resolved place labels if different from typed labels
- warning badges if provider fallback used

Step 2: Add render helper

Example:

```js
function renderRouteSummary({ goRoute, backRoute }) {
  // write cards into #map
}
```

Step 3: Keep full map drawing out of MVP
- no Leaflet yet
- no polyline rendering yet

Reason:
- route math is the core need
- map rendering can be added later once routing is stable

---

## Task 10: Add robust user-facing error handling

Objective: make public/hosted endpoint failures survivable.

Files:
- Modify: `index.html`
- Modify: `app.js`
- Modify: `style.css`

Step 1: Add status/error message container if not already present.

Step 2: Show readable messages for:
- address not found
- route not found
- provider temporarily unavailable
- request timed out

Step 3: Keep previous successful totals on transient failures if possible

Step 4: Verify manually by forcing bad inputs:
- nonsense address
- empty origin
- empty destination

---

## Task 11: Add a minimal backend smoke test script

Objective: create a cheap regression check without introducing a full test framework yet.

Files:
- Create: `scripts/smoke-test.sh`

Script should:
1. hit `/api/health`
2. hit `/api/geocode?q=Central%20Hong%20Kong`
3. hit `/api/route` for `Central -> Sha Tin`
4. exit nonzero on failure

Example:

```bash
#!/usr/bin/env bash
set -euo pipefail
curl -fsS http://127.0.0.1:8000/api/health >/dev/null
curl -fsS 'http://127.0.0.1:8000/api/geocode?q=Central%20Hong%20Kong' | jq '.ok' >/dev/null
curl -fsS -X POST http://127.0.0.1:8000/api/route \
  -H 'Content-Type: application/json' \
  -d '{"origin":"Central, Hong Kong","destination":"Sha Tin, Hong Kong","waypoints":[]}' | jq '.ok' >/dev/null
```

Verification:
```bash
chmod +x scripts/smoke-test.sh
./scripts/smoke-test.sh
```

---

## Task 12: Update README for the new architecture

Objective: make setup obvious for Lincoln or future contributors.

Files:
- Modify: `README.md`

Add sections:
- Why Google was removed
- Required hosted API keys
- How to create `.env`
- How to run locally
- Current limitations
  - Nominatim usage limits
  - hosted routing providers may rate-limit
  - map rendering deferred in MVP

Suggested local run commands:

```bash
cp .env.example .env
node server.js
open http://127.0.0.1:8000
```

---

## Recommended sequence of commits

1. `feat: add node backend entrypoint and health check`
2. `feat: add nominatim geocoding proxy`
3. `feat: add cached routing provider adapters`
4. `refactor: remove google maps javascript dependency`
5. `feat: add lightweight autocomplete and route summary ui`
6. `docs: update readme for hosted osm routing architecture`

---

## Acceptance criteria

A migration is complete when all are true:

- App loads with no Google JS script tag
- User can type `Central, Hong Kong` and `Sha Tin, Hong Kong`
- Suggestions appear from `/api/geocode`
- Route request returns nonzero distance/time through backend
- Tunnel/toll calculation still works
- Return trip still works
- Frontend never calls third-party geocoding/routing APIs directly
- Provider fallback exists in backend
- README explains setup clearly

---

## Post-MVP upgrades (do later, not now)

- Add Leaflet/MapLibre map rendering using returned polyline
- Add local persistent cache (SQLite/file cache)
- Add provider health metrics and logging
- Add self-host option documentation
- Add tests around toll timing rules
