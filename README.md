# Tesla Smart Route Planner (Hong Kong)

A lightweight route budgeting tool for Tesla owners in Hong Kong.

This fork runs in two modes:
- local Node server for development (`server.js`)
- Cloudflare Pages + Functions for hosted frontend/backend deployment (`functions/api/[[route]].js`)

## What the app does

- requires login before route usage
- supports multiple login accounts via `AUTH_ACCOUNTS_JSON`
- geocodes places with Nominatim
- routes with openrouteservice and falls back to GraphHopper
- renders route lines on a Leaflet map
- preserves the Hong Kong tunnel/toll logic already in the app
- supports return-trip budgeting and Tesla energy estimates

## Project layout

- Frontend: `index.html`, `app.js`, `style.css`, `login.html`, `login.js`, `config.js`
- Local backend: `server.js`
- Hosted backend: `functions/api/[[route]].js`
- Shared backend logic: `lib/`
- Tests: `tests/`
- Utility scripts: `scripts/`

## Prerequisites

For local development:
- Node.js 18+ recommended

For hosted deployment:
- Cloudflare account
- Cloudflare API token
- Cloudflare account ID
- openrouteservice API key
- GraphHopper API key
- Wrangler CLI

Install Wrangler if needed:

```bash
npm install -g wrangler
```

## 1. Clone the repo

```bash
git clone https://github.com/EddieTYP/mycar.git
cd mycar
```

## 2. Create local environment variables

Copy the template:

```bash
cp .env.example .env
```

Edit `.env` and set real values:

```bash
PORT=8000
ORS_API_KEY=your_openrouteservice_key
GRAPHHOPPER_API_KEY=your_graphhopper_key
AUTH_ACCOUNTS_JSON={"admin":"change_me","guest":"change_me_too"}
SESSION_SECRET=replace_with_a_long_random_secret
```

Notes:
- `AUTH_ACCOUNTS_JSON` must be valid JSON on a single line.
- Do not commit `.env`.
- Use strong real passwords and a long random `SESSION_SECRET`.

## 3. Run locally

Start the local server:

```bash
npm start
```

Open the app in your browser:

```text
http://127.0.0.1:8000/login.html
```

## 4. Verify local setup

Run tests:

```bash
npm test
```

Run the smoke test against the running local server:

```bash
npm run smoke
```

Manual API checks if needed:

```bash
curl http://127.0.0.1:8000/api/health
curl 'http://127.0.0.1:8000/api/geocode?q=Central%20Hong%20Kong'
curl -X POST http://127.0.0.1:8000/api/route \
  -H 'Content-Type: application/json' \
  -d '{"origin":"Central, Hong Kong","destination":"Sha Tin, Hong Kong","waypoints":[]}'
```

## 5. Manage accounts locally

Accounts are stored in `.env` as `AUTH_ACCOUNTS_JSON`.

Examples:

```bash
npm run accounts -- view
npm run accounts -- view --verbose
npm run accounts -- add user2 strongpassword
npm run accounts -- set-password user2 newpassword
npm run accounts -- delete user2
```

By default, add/delete/set-password will attempt Cloudflare secret sync and deployment unless you pass:

```bash
--no-sync
--no-deploy
```

More script notes: `scripts/README.md`

## 6. Optional: run Cloudflare Pages locally

If you want to emulate the Pages Function locally with Wrangler:

```bash
cp .dev.vars.example .dev.vars
```

Then fill `.dev.vars` with real values. Example:

```bash
AUTH_ACCOUNTS_JSON={"admin":"change_me","guest":"change_me_too"}
SESSION_SECRET=replace_with_a_long_random_secret
ORS_API_KEY=your_openrouteservice_key
GRAPHHOPPER_API_KEY=your_graphhopper_key
```

Then run Wrangler locally:

```bash
wrangler pages dev .
```

Notes:
- `.dev.vars` is for local `wrangler pages dev` usage only.
- Production deploys do not read `.dev.vars`; they read Cloudflare secrets.

## 7. Deploy the full app to Cloudflare Pages

This section replicates the whole hosted setup: static frontend + Pages Function backend + login secrets + routing keys.

### Step 7.1 Export Cloudflare credentials in your shell

```bash
export CLOUDFLARE_API_TOKEN=your_cloudflare_api_token
export CLOUDFLARE_ACCOUNT_ID=your_cloudflare_account_id
```

### Step 7.2 Create the Pages project if it does not exist yet

```bash
wrangler pages project create mycar
```

If the project already exists, Cloudflare will tell you.

### Step 7.3 Make sure local `.env` contains the production values you want to publish

The sync script reads from local `.env`, so update `.env` first.

### Step 7.4 Sync secrets from `.env` into Cloudflare Pages

```bash
npm run sync:cloudflare
```

That script pushes these values into the Pages project:
- `AUTH_ACCOUNTS_JSON`
- `SESSION_SECRET`
- `ORS_API_KEY`
- `GRAPHHOPPER_API_KEY`

### Step 7.5 Deploy the repo

```bash
wrangler pages deploy . --project-name mycar
```

### Step 7.6 Open the deployed site and test login + route search

After deploy, open the Pages URL returned by Wrangler and verify:
- login page loads
- login works with an account from `AUTH_ACCOUNTS_JSON`
- route search works
- map route line renders

## 8. Ongoing updates

After future changes, the usual deploy flow is:

```bash
npm test
npm run sync:cloudflare
wrangler pages deploy . --project-name mycar
```

If you connected the repo to Cloudflare Pages auto-deploy, code pushes can deploy automatically, but secret updates still need to be synced when credentials change.

## Security note

Example files must stay generic. Do not put real usernames, passwords, API keys, or session secrets in:
- `.env.example`
- `.dev.vars.example`
- `README.md`
- tests

If any real credentials were ever committed or pasted into repo history, rotate them.

## Notes

- Static files are served from repo root.
- Hosted API lives at `functions/api/[[route]].js`.
- Login and route APIs stay same-origin on the Cloudflare Pages domain.
- Nominatim and the routing providers are third-party services and may rate-limit.
- `.cloudflare-sync-state.json` is generated local state and can be safely deleted.
- `LOCAL-DEVELOPMENT-NOTES.md` is local-only and intentionally git-ignored.
