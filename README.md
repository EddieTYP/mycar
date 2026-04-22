# Tesla Smart Route Planner (Hong Kong)

A lightweight route budgeting tool for Tesla owners in Hong Kong.

This fork now runs in two modes:
- local Node server for development (`server.js`)
- Cloudflare Pages + Functions for hosted frontend/backend deployment (`functions/api/[[route]].js`)

## Features

- login required before route usage
- multiple login accounts via `AUTH_ACCOUNTS_JSON`
- geocoding via Nominatim with in-memory cache
- routing via openrouteservice with GraphHopper fallback
- Leaflet map route rendering
- Hong Kong tunnel/toll logic preserved
- return-trip budgeting, time-aware toll calculation, and Tesla energy estimate

## Runtime layout

- Frontend: `index.html`, `app.js`, `style.css`, `login.html`, `login.js`, `config.js`
- Local backend: `server.js`
- Hosted backend: `functions/api/[[route]].js`
- Shared backend logic: `lib/`
- Tests: `tests/`
- Utility scripts: `scripts/`

## Environment setup

Copy the template and fill in real values:

```bash
cp .env.example .env
```

Required local variables:

```bash
PORT=8000
ORS_API_KEY=your_openrouteservice_key
GRAPHHOPPER_API_KEY=your_graphhopper_key
AUTH_ACCOUNTS_JSON={"demo-admin":"password1","demo-guest":"password2"}
SESSION_SECRET=replace_with_a_long_random_secret
```

## Local development

Start the local app:

```bash
npm start
```

Then open:

```bash
open http://127.0.0.1:8000/login.html
```

## Scripts

```bash
npm test                     # unit tests
npm run smoke                # local API smoke test against a running server
npm run accounts -- view     # inspect configured accounts in .env
npm run sync:cloudflare      # sync .env secrets to Cloudflare Pages
```

More script notes: `scripts/README.md`

## Account management

Accounts are stored in local `.env` as `AUTH_ACCOUNTS_JSON`.

Examples:

```bash
npm run accounts -- view
npm run accounts -- view --verbose
npm run accounts -- add user2 strongpassword
npm run accounts -- set-password user2 newpassword
npm run accounts -- delete alice
```

By default, add/delete/set-password will attempt Cloudflare secret sync and deployment unless you pass:

```bash
--no-sync
--no-deploy
```

## Cloudflare Pages deployment

1. Install Wrangler.
2. Optional for local Pages emulation: copy `.dev.vars.example` to `.dev.vars` and fill in local values.
3. Export `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in your shell.
4. Ensure `.env` contains the production values you want to publish.
5. Sync secrets:

```bash
npm run sync:cloudflare
```

6. Deploy:

```bash
wrangler pages deploy . --project-name mycar
```

Notes:
- Static files are served from repo root.
- Hosted API lives at `functions/api/[[route]].js`.
- Login and route APIs stay same-origin on the Cloudflare Pages domain.
- `.dev.vars` is only for local `wrangler pages dev` usage; production deploys read Cloudflare secrets instead.

## Verification

Unit tests:

```bash
npm test
```

Smoke test with a running local server:

```bash
npm run smoke
```

Quick manual backend checks:

```bash
curl http://127.0.0.1:8000/api/health
curl 'http://127.0.0.1:8000/api/geocode?q=Central%20Hong%20Kong'
curl -X POST http://127.0.0.1:8000/api/route \
  -H 'Content-Type: application/json' \
  -d '{"origin":"Central, Hong Kong","destination":"Sha Tin, Hong Kong","waypoints":[]}'
```

## Notes

- Nominatim and the routing providers are third-party services and may rate-limit.
- `.cloudflare-sync-state.json` is generated local state and can be safely deleted.
- `LOCAL-DEVELOPMENT-NOTES.md` is local-only and intentionally git-ignored.
