# RouteForge — Environment Setup Guide

> **For your teammate:** This file explains every API key and environment variable needed to run RouteForge, where to put them, and how to obtain them.

---

## 📁 Where to Save Environment Variables

### Option 1: Shell Export (Quick / Development)
Export variables in your terminal before starting the API:
```bash
export NEWSAPI_KEY=your_key_here
export TOMTOM_API_KEY=your_key_here
cd apps/api && npm run dev
```

### Option 2: `.env` File (Recommended for Teams)
Create a file named `.env` inside **`apps/api/`** and add your variables there:
```
# apps/api/.env
NEWSAPI_KEY=your_key_here
TOMTOM_API_KEY=your_key_here
GEMINI_API_KEY=your_key_here
```

> **Note:** The API does **not** include `dotenv` by default. If you use a `.env` file, either:
> - Load it with your process manager (PM2, Docker, systemd)
> - Or run: `env $(cat apps/api/.env | xargs) npm run dev`

### Option 3: Docker / Production
Pass variables at runtime:
```bash
docker run -e NEWSAPI_KEY=your_key -e TOMTOM_API_KEY=your_key ...
```

---

## 🔑 Required vs Optional Variables

### ✅ Required to Start (Zero API Keys Needed)

| Variable | Default | What It Does |
|----------|---------|--------------|
| `PORT` | `8080` | API server listens on this port |
| `NODE_ENV` | `development` | Set to `production` for production mode |

**RouteForge works with no configuration.** It uses public routing services and shows empty disruptions until you add API keys.

---

## 🗺️ Routing Services (Optional — Better Speed/Reliability)

By default, RouteForge uses free public routing APIs (OSRM, GraphHopper). For production, self-hosting is recommended.

| Variable | How to Obtain | Purpose |
|----------|---------------|---------|
| `OSRM_BASE_URL` | Self-host: `docker run -d -p 5000:5000 osrm/osrm-backend` then set to `http://localhost:5000` | Custom OSRM routing server (faster, more reliable than public) |
| `GRAPHHOPPER_URL` | Self-host: `docker run -d -p 8989:8989 graphhopper/graphhopper` then set to `http://localhost:8989` | Custom GraphHopper routing server |
| `GRAPHHOPPER_API_KEY` | Sign up at https://www.graphhopper.com/ | GraphHopper cloud API key (if not self-hosting) |
| `ORS_API_KEY` | Sign up at https://openrouteservice.org/ | OpenRouteService API key (fallback routing) |

---

## 📰 Live Disruption Sources (Optional — Real Incident Data)

These enable RouteForge to fetch real-world traffic incidents, news about road closures, weather disruptions, etc.

| Variable | How to Obtain | Free Tier | Purpose |
|----------|---------------|-----------|---------|
| `NEWSAPI_KEY` | https://newsapi.org/register | 100 requests/day | Fetches news articles about traffic accidents, storms, floods, construction near your route |
| `TOMTOM_API_KEY` | https://developer.tomtom.com/ | 2,500 requests/day | Real-time traffic incidents, congestion, accidents with precise GPS coordinates |
| `OPEN511_BASE_URL` | Your regional transport agency | Usually free | Government-standardized traffic event data (e.g., `https://api.open511.gov.bc.ca`) |

> **Tip:** Start with just `NEWSAPI_KEY` — it's the easiest to set up and gives you real disruption data globally.

---

### 🧠 Disruption Classification Engine

RouteForge includes an upgraded disruption detection engine (`apps/api/src/services/trafficIncidents.js`) with:

- **Weighted keyword matching** — Each keyword has a confidence weight (0.0–1.0). Returns `{ category, confidence }`.
- **Structured type mapping** — API type codes like `TRAFFIC_JAM`, `ROAD_CLOSED` are mapped directly to canonical categories.
- **Geo-spatial filtering** — Uses `@turf/turf` `pointToLineDistance` for precise proximity detection.
- **Risk scoring** — `risk = severity * (1 / (distance + 1))` for prioritizing incidents.
- **Severity normalization** — All inputs normalized to 1–10 scale.

No additional configuration is needed — the engine works automatically with your disruption sources.

---

## 🤖 AI / Reasoning (Optional — Smart Explanations)

| Variable | How to Obtain | Free Tier | Purpose |
|----------|---------------|-----------|---------|
| `GEMINI_API_KEY` | https://ai.google.dev/ | 1,500 requests/day | Generates natural-language route reasoning and answers chat questions |
| `GEMINI_MODEL` | — | — | Defaults to `gemini-2.5-flash`. Change if you want a different model. |

**Without GEMINI_API_KEY:** RouteForge falls back to template-based reasoning. It still works, just less "conversational."

---

## 💾 Database / Persistence (Optional — Defaults to In-Memory)

By default, scenarios are stored in memory and backed up to a local `.scenarios.json` file. For multi-user or production, use Firestore.

| Variable | How to Obtain | Purpose |
|----------|---------------|---------|
| `GCP_PROJECT_ID` | Google Cloud Console → Create Project | Google Cloud project ID for Firestore database |
| `FIRESTORE_COLLECTION` | — | Collection name (default: `scenarios`) |
| `USE_IN_MEMORY_DB` | Set to `true` or `false` | Force in-memory mode even if GCP_PROJECT_ID is set |
| `SCENARIOS_DATA_FILE` | — | Path for local JSON backup (default: `apps/api/.scenarios.json`) |

---

## 🌐 Frontend Configuration

Create **`apps/web/.env`** for the frontend:

| Variable | Default | Purpose |
|----------|---------|---------|
| `VITE_API_BASE` | `http://localhost:8080` | URL of the backend API |

**Example `apps/web/.env`:**
```
VITE_API_BASE=http://localhost:8080
```

For production, point it at your deployed API:
```
VITE_API_BASE=https://api.yourcompany.com
```

---

## 🔧 Development / Testing Variables

| Variable | Purpose |
|----------|---------|
| `USE_MOCK_SERVICES` | Set to `true` to use synthetic routes instead of real routing APIs. **Only used by the test suite.** |
| `CORS_ORIGINS` | Comma-separated list of allowed frontend origins. Default: `http://localhost:5173,http://localhost:5174,http://localhost:5175` |
| `JEST_WORKER_ID` | Auto-set by Jest. Used internally to detect test mode. |

---

## 🚀 Quick Start Checklist for Your Teammate

### Step 1: Install Dependencies
```bash
cd smart-supply-chain-v2-main
npm install  # or yarn install
```

### Step 2: Get at least one API key (recommended: NewsAPI)
1. Go to https://newsapi.org/register
2. Copy your API key

### Step 3: Set the environment variable
```bash
export NEWSAPI_KEY=your_actual_key_here
```

### Step 4: Start the API
```bash
cd apps/api
npm run dev
# Should show: API listening on http://localhost:8080
```

### Step 5: Start the Web UI
```bash
cd apps/web
npm run dev
# Open http://localhost:5173
```

### Step 6: Test
1. Enter source coordinates (e.g., `40.7128, -74.0060` for NYC)
2. Enter destination coordinates (e.g., `34.0522, -118.2437` for LA)
3. Click **"Compute optimized route"**
4. You should see real disruptions in the **Disruptions** section

---

## 📋 Complete `.env` Template

Copy this into `apps/api/.env` and fill in your values:

```bash
# ==== SERVER ====
PORT=8080
NODE_ENV=development

# ==== ROUTING (optional — improves speed) ====
# OSRM_BASE_URL=http://localhost:5000
# GRAPHHOPPER_URL=http://localhost:8989
# GRAPHHOPPER_API_KEY=
# ORS_API_KEY=

# ==== DISRUPTION SOURCES (recommended) ====
NEWSAPI_KEY=your_newsapi_key_here
# TOMTOM_API_KEY=your_tomtom_key_here
# OPEN511_BASE_URL=https://your-open511-server.com/api

# ==== AI / REASONING (optional) ====
# GEMINI_API_KEY=your_gemini_key_here
# GEMINI_MODEL=gemini-2.5-flash

# ==== DATABASE (optional — defaults to in-memory) ====
# GCP_PROJECT_ID=your-gcp-project-id
# FIRESTORE_COLLECTION=scenarios
# USE_IN_MEMORY_DB=false

# ==== CORS ====
# CORS_ORIGINS=http://localhost:5173,http://localhost:5174
```

---

## 🆘 Troubleshooting

| Problem | Likely Cause | Fix |
|---------|--------------|-----|
| "No disruption sources configured" | No `NEWSAPI_KEY`, `TOMTOM_API_KEY`, or `OPEN511_BASE_URL` set | Add at least one API key |
| "No routing service is available" | All routing APIs failed | Check internet connection, or set `USE_MOCK_SERVICES=true` for testing only |
| "Gemini disabled" | No `GEMINI_API_KEY` set | Add `GEMINI_API_KEY` or ignore — fallback reasoning still works |
| CORS errors in browser | `CORS_ORIGINS` doesn't include your frontend URL | Add your frontend URL to `CORS_ORIGINS` |
| Scenarios lost on restart | No database configured | Set `GCP_PROJECT_ID` for Firestore, or scenarios auto-save to `.scenarios.json` |

---

*Generated from codebase analysis. Last updated: 2026-04-25*
