# 🚗 Tesla Smart Route Planner (Hong Kong)

A lightweight, browser-based route budgeting tool for Tesla owners in Hong Kong.

This repo keeps the UI simple and keeps routing logic in a tiny Node backend so frontend traffic never calls third-party geocoding or routing services directly.

## ✅ What changed

- Removed Google Maps JS/API dependency from the frontend.
- Added backend endpoints:
  - `GET /api/health`
  - `POST /api/login`
  - `POST /api/logout`
  - `GET /api/session`
  - `GET /api/geocode?q=<query>`
  - `POST /api/route`
- Added login gate: user must login before using route search.
- Geocoding via **Nominatim** with in-memory cache.
- Routing via **openrouteservice** (primary) and **GraphHopper** (fallback).
- Frontend now uses suggestion dropdowns for address lookup and calls `/api/route` for distance/time.
- Route map rendering is intentionally deferred; current UI shows route summary cards instead.

## Features

- 2026 tunnel logic preserved:
  - three harbour tunnel time bands
  - Tai Lam toll tiers
  - Tai Po Road as zero-cost tunnel option
- Return-trip mode with separate departure-time-aware toll calculation.
- Tesla energy estimate and total budget card from distance.
- Dynamic tunnel buttons based on entered locations.

## API keys and why we changed

The app now avoids Google dependency and instead uses:

- **Nominatim** (OpenStreetMap) for geocoding/search.
- **openrouteservice** for routing by default.
- **GraphHopper** as a fallback when openrouteservice is unavailable.

## Setup

1. Create environment file:

   ```bash
   cp .env.example .env
   ```

   Set API keys and login credentials:

   ```bash
   PORT=8000
   ORS_API_KEY=your_openrouteservice_key_here
   GRAPHHOPPER_API_KEY=your_graphhopper_key_here
   AUTH_USERNAME=demo-admin
   AUTH_PASSWORD=change_this_password
   SESSION_SECRET=change_this_session_secret
   ```

2. Start server:

   ```bash
   node server.js
   ```

3. Open app:

   ```bash
   open http://127.0.0.1:8000/login.html
   ```

## Backend verification

- Health check:

  ```bash
  curl http://127.0.0.1:8000/api/health
  ```

- Geocode:

  ```bash
  curl 'http://127.0.0.1:8000/api/geocode?q=Central%20Hong%20Kong'
  ```

- Route:

  ```bash
  curl -X POST http://127.0.0.1:8000/api/route \
    -H 'Content-Type: application/json' \
    -d '{"origin":"Central, Hong Kong","destination":"Sha Tin, Hong Kong","waypoints":[]}'
  ```

## Current limitations

- Nominatim usage is polite-rate-limited (cache + short queries) and should be used within provider limits.
- Both routing providers can rate-limit; GraphHopper serves as fallback when openrouteservice fails/timeouts.
- Route map rendering is not included in this migration phase (summary only).

## Run a lightweight smoke check

```bash
./scripts/smoke-test.sh
```
