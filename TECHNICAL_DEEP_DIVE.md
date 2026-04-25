# RouteForge — Technical Deep Dive

> Real-time route intelligence for resilient supply chains.

For developers and architects. Covers every system layer.

---

## 1. Architecture

```
Frontend (Preact/Vite)  <--HTTP-->  Backend (Express/Node.js ESM)
  Leaflet Maps                       ├─ Routing: OSRM -> GraphHopper -> ORS
  Playback UI                        ├─ Disruptions: NewsAPI, TomTom, Open511
  Chat Box                           ├─ AI: Gemini (with fallback templates)
  Metrics Panel                      ├─ DB: Firestore -> In-Memory + JSON
  Scenario Form                      └─ Geo: Nominatim geocoding + haversine math
```

**Tech Stack:** Node.js 18+ ESM, Express 4.21, Zod 3.25, Preact 10.26, Vite 6.3, Leaflet 1.9, @turf/turf, Jest, Vitest, Playwright.

---

## 2. API Endpoints

| Endpoint | Method | Body | Response |
|----------|--------|------|----------|
| `/api/health` | GET | — | `{ ok, storage_mode, route_provider }` |
| `/api/routes/compute` | POST | `{ source, destination, label? }` | `{ scenario_id, route, live_disruptions, risk_score, cost_usd, reasoning }` |
| `/api/routes/disruption` | POST | `{ scenario_id, incidents[] }` | `{ disruption, reroute: { ...route, multiplier_applied }, reasoning }` |
| `/api/scenarios` | GET | — | `{ scenarios[] }` |
| `/api/scenarios/:id` | GET | — | Full scenario object |
| `/api/scenarios/:id/playback` | GET | — | `{ source, destination, events[], reasoning, active_disruption }` |
| `/api/reasoning` | POST | `{ scenario_id }` | `{ reasoning }` |
| `/api/chat` | POST | `{ scenario_id, message }` | `{ reply }` |

---

## 3. Request Lifecycle: POST /api/routes/compute

1. **Parse** — `express.json({ limit: "1mb" })`
2. **Validate** — Zod: `lat` in [-90,90], `lon` in [-180,180], `label` max 120 chars
3. **Route** — `computeRoute()`: cache -> OSRM primary -> 3 OSRM fallbacks -> GraphHopper -> OpenRouteService
4. **Disruptions** — `fetchLiveIncidentsForRoute()`: bbox with 50km padding -> query providers in parallel -> normalize -> classify -> validate location -> turf proximity filter (<=50km)
5. **Label** — `buildLabel()`: reverse-geocode via Nominatim -> "City A -> City B" or fallback to coords
6. **Metrics** — Risk: `clamp(5, 100, durationH * 6 + distanceKm * 0.02)`. Cost: `distanceKm * 1.2 + durationH * 40`
7. **Persist** — `createScenario()` -> Firestore or in-memory Map + `.scenarios.json` backup
8. **Reason** — `generateReasoning()` -> Gemini API or template fallback
9. **Respond** — Full JSON with scenario_id, route, disruptions, metrics, reasoning

---

## 4. Request Lifecycle: POST /api/routes/disruption

1. **Validate** — Zod: `scenario_id` string, `incidents[]` with id/category/type/description/severity/location
2. **Load** — `getScenarioById()` — 404 if missing, 409 if no initial_route event
3. **Type** — 1 incident = category; 2+ = `"multiple_disruptions"` severity `"high"`
4. **Waypoints** — Perpendicular offset: `routeBearing + side * π/2` (side = +1 even, -1 odd). Offset = `max(minOffsetKm, pctOffset)` capped at 80km
5. **Reroute** — `computeRoute({ source, destination, intermediates: waypoints })`
6. **Multiplier** — `max(1.05, typeMultiplier * countMultiplier)` where `countMultiplier = 1.0 + count * 0.15`. **Applied to detour delta only**: `baselineDuration + (detour * multiplier)`
7. **Metrics** — Recalculate risk with type boost (5-30 points) + cost
8. **Update** — Overwrite previous disruption/reroute events. Events: `[initial_route, disruption, reroute]`
9. **Respond** — `{ disruption, reroute: { ...route, multiplier_applied }, reasoning }`

---

## 5. Backend Services

### 5.1 Routing (googleRoutes.js)

**Fallback chain:** OSRM (primary + 3 alternates) -> GraphHopper (self-hosted or cloud) -> OpenRouteService. All with 10s AbortController timeout.

**Caching:** LRU, 100 entries, 5min TTL. Key = `"lat1,lon1|lat2,lon2"`. Hit returns new UUID with cached geometry.

**Mock mode (`USE_MOCK_SERVICES=true`):** Straight-line interpolation with sinusoidal curves. 1 point per 100km. Distance = haversine sum. Duration = `distance / 74kmh * 3600`. Tests only.

**Normalization:** All providers return `{ route_id: uuid, distance_m: int, duration_s: int, geometry: GeoJSON }`.

### 5.2 Disruptions (trafficIncidents.js) — Upgraded Engine

The disruption engine has been upgraded with weighted classification, structured type mapping, and `@turf/turf` geo-filtering.

**Pipeline:** Raw APIs -> Normalize -> Classify -> Validate Location -> Turf Proximity Filter -> Risk Score -> Sort

**Classification Engine:**

1. **Structured Type Mapping (Priority 1):** `STRUCTURED_TYPE_MAPPING` maps 30+ API type codes directly to canonical categories. Examples: `TRAFFIC_JAM -> congestion`, `ROAD_CLOSED -> road_closure`. Confidence = 1.0.

2. **Weighted Keyword Matching (Priority 2):** Each of 11 categories has weighted keywords (0.0–1.0). For each incident, the engine computes a category score by summing matched keyword weights. Confidence = `bestScore / theoreticalMax` for that category, clamped 0–1.

3. **Severity Normalization:** Any input normalized to 1–10 scale. String mappings: critical=10, high=8, medium=5, low=2, unknown=3.

**Normalize Incident:**
```javascript
normalizeIncident(raw) -> {
  id, lat, lon, category, confidence (0-1),
  severity (1-10), source, description,
  type, reported_at, raw
}
```

**Geo-Spatial Filtering with Turf:**
- `isNearRoute(point, routeCoords, thresholdKm)` — `turf.pointToLineDistance` in kilometers
- `distanceFromRoute(point, routeCoords)` — exact km distance
- Route converted to `turf.lineString` once, reused for all checks

**Main Pipeline:**
```javascript
getRouteDisruptions(routeCoords, incidents, { thresholdKm=50, includeRisk=true })
  -> normalize all incidents
  -> classify (structured map -> weighted keywords)
  -> filter by turf.pointToLineDistance < thresholdKm
  -> attach distanceFromRoute
  -> compute risk = severity * (1 / (distance + 1))
  -> sort by severity desc, then distance asc
```

**Providers (parallel via `Promise.allSettled`):**
- **Open511:** `OPEN511_BASE_URL` -> bbox query -> events/features
- **TomTom:** `TOMTOM_API_KEY` -> bbox query -> incidents array
- **NewsAPI:** `NEWSAPI_KEY` -> 9 keyword queries -> deduplicate by URL -> relevance filter (27 keywords) -> geocode title then description -> discard ungeocoded

### 5.3 Persistence (firestore.js)

**Three tiers:**
1. **Firestore:** `GCP_PROJECT_ID` set + connection test passes
2. **In-Memory + JSON:** Default. `memoryStore` Map + `.scenarios.json` file auto-loaded/saved
3. **In-Memory Only:** `NODE_ENV=test`, no disk ops

All reads/writes use `JSON.parse(JSON.stringify(value))` to prevent reference mutation.

### 5.4 AI (gemini.js)

**Dual mode:**
- **AI mode:** `GEMINI_API_KEY` set + not mock. Calls Gemini 2.5-flash with structured prompt. Temperature 0.4, max 220 tokens, trimmed to 120 words.
- **Fallback mode:** Template-based reasoning. No disruption = baseline summary. With disruption = type + baseline + reroute summary.

Chat uses same pattern with scenario context + user message.

### 5.5 Geospatial Math (geo.js)

**Haversine:** Great-circle distance. `6371 * 2 * atan2(sqrt(hav), sqrt(1-hav))`.

**Point-to-segment:** Dot product projection. If outside segment, nearest endpoint. Else perpendicular distance.

**Destination point:** Given start, bearing, distance. Uses spherical law of cosines.

**Nominatim geocoding:**
- Reverse: `nominatim.openstreetmap.org/reverse?lat={}&lon={}&zoom=10`. Extracts city->state->country. 5s timeout.
- Forward: `nominatim.openstreetmap.org/search?q={}&limit=1`. Optional countrycodes filter.
- Cache: 200-entry LRU Map. Key = coords to 4 decimals or `"fwd:{query}:{cc}"`.

---

## 6. Frontend

### 6.1 State (App.jsx)

16 `useState` hooks, all lifted to App.jsx. No global state library — props drill max 3 levels.

Key state: `sourceInput`, `destinationInput`, `scenarioId`, `baselineRoute`, `rerouteRoute`, `liveDisruptions`, `selectedLiveDisruptions`, `activeDisruption`, `playbackStep`, `chatMessages`.

### 6.2 Playback

3 steps (0=baseline, 1=disruption, 2=reroute). Auto-play via `setInterval` 1100ms. Manual via range slider.

Map renders: step 0 = solid teal; step 1 = teal + amber markers; step 2 = faded dashed teal + solid amber + markers.

### 6.3 Map (Map.jsx)

Leaflet with CARTO Voyager tiles. Three `L.layerGroup`: markers, routes, alerts. Full clear/redraw on prop change. `fitBounds({ padding: [32,32], maxZoom: 12 })`. GeoJSON `[lon,lat]` flipped to Leaflet `[lat,lon]`.

### 6.4 API Client (lib/api.js)

Base URL: `import.meta.env.VITE_API_BASE || "http://localhost:8080"`. Always `Content-Type: application/json`. Throws on non-2xx.

---

## 7. Error Handling

| Layer | Failure | Handling |
|-------|---------|----------|
| Routing | OSRM down | 3 fallback OSRM instances |
| Routing | All OSRM down | GraphHopper |
| Routing | GraphHopper down | OpenRouteService |
| Routing | All down | 500 error |
| Disruptions | Provider fails | `Promise.allSettled` skips it, others continue |
| Disruptions | No providers | Returns `[]` (no error) |
| AI | Gemini fails | Template fallback (never fatal) |
| DB | Firestore fails | Permanent fallback to in-memory |
| Validation | Zod fails | 400 with issue details |

---

## 8. Testing

**API tests (Jest + Supertest):** 8 tests covering compute, disruption, reasoning, chat, scenarios list, scenario get, playback, 404.

**Web tests (Vitest + Testing Library):** 4 tests. Map and API mocked.

**E2E (Playwright):** Full user journey with mocked API responses.

Test env: `USE_IN_MEMORY_DB=true`, `USE_MOCK_SERVICES=true`.

---

## 9. Performance Optimizations

| Optimization | Location | Impact |
|--------------|----------|--------|
| Route cache (100 entries, 5min TTL) | googleRoutes.js | Eliminates duplicate API calls |
| Nominatim cache (200 entries) | geo.js | Avoids repeated geocoding |
| Turf point-to-line distance | trafficIncidents.js | Precise geo-filtering, no custom math |
| Promise.allSettled | trafficIncidents.js | Parallel fetching, no blocking |
| AbortController timeouts | All fetch calls | Prevents hung connections |
| JSON clone | firestore.js | Prevents reference mutation |
| Preact | package.json | ~3KB smaller than React |
| Vite | vite.config.js | Instant HMR, optimized builds |

---

## 10. Configuration Tables

### DISRUPTION_OFFSET_PCT
accident=8%, congestion=6%, construction=10%, hazard=7%, weather=12%, natural_disaster=25%, road_closure=12%, vehicle_breakdown=5%, police_activity=8%, special_event=15%, other=10%

### DISRUPTION_MIN_OFFSET_KM
accident=20, congestion=15, construction=25, hazard=18, weather=30, natural_disaster=60, road_closure=30, vehicle_breakdown=12, police_activity=20, special_event=35, other=25

### DISRUPTION_DURATION_MULTIPLIER
accident=1.40, congestion=1.35, construction=1.25, hazard=1.30, weather=1.50, natural_disaster=2.50, road_closure=1.10, vehicle_breakdown=1.20, police_activity=1.30, special_event=1.40, other=1.25

### DISRUPTION_TYPE_BOOST (risk points)
accident=8, congestion=6, construction=7, hazard=9, weather=12, natural_disaster=30, road_closure=10, vehicle_breakdown=5, police_activity=8, special_event=15, other=7

---

## 11. Environment Variables (Full Reference)

| Variable | Where | Purpose |
|----------|-------|---------|
| `PORT` | API | Server port (default 8080) |
| `NODE_ENV` | API | production/development |
| `CORS_ORIGINS` | API | Comma-separated allowed origins |
| `OSRM_BASE_URL` | API | Custom OSRM instance |
| `GRAPHHOPPER_URL` | API | Self-hosted GraphHopper |
| `GRAPHHOPPER_API_KEY` | API | GraphHopper cloud API key |
| `ORS_API_KEY` | API | OpenRouteService API key |
| `NEWSAPI_KEY` | API | NewsAPI for disruption data |
| `TOMTOM_API_KEY` | API | TomTom traffic incidents |
| `OPEN511_BASE_URL` | API | Regional Open511 endpoint |
| `GEMINI_API_KEY` | API | Gemini AI reasoning |
| `GEMINI_MODEL` | API | Model name (default gemini-2.5-flash) |
| `GCP_PROJECT_ID` | API | Google Cloud project for Firestore |
| `FIRESTORE_COLLECTION` | API | Collection name (default scenarios) |
| `USE_IN_MEMORY_DB` | API | Force in-memory mode |
| `SCENARIOS_DATA_FILE` | API | JSON backup path (default .scenarios.json) |
| `USE_MOCK_SERVICES` | API | Use synthetic routes (tests only) |
| `VITE_API_BASE` | Web .env | API base URL (default http://localhost:8080) |

---

*Generated from codebase analysis. Last updated: 2026-04-25*
