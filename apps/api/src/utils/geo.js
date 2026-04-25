const EARTH_RADIUS_KM = 6371;

export const DISRUPTION_OFFSET_PCT = {
  accident: 0.08,
  congestion: 0.06,
  construction: 0.10,
  hazard: 0.07,
  weather: 0.12,
  natural_disaster: 0.25,
  road_closure: 0.12,
  vehicle_breakdown: 0.05,
  police_activity: 0.08,
  special_event: 0.15,
  other: 0.10,
};

export const DISRUPTION_MIN_OFFSET_KM = {
  accident: 20,
  congestion: 15,
  construction: 25,
  hazard: 18,
  weather: 30,
  natural_disaster: 60,
  road_closure: 30,
  vehicle_breakdown: 12,
  police_activity: 20,
  special_event: 35,
  other: 25,
};

export const DISRUPTION_DURATION_MULTIPLIER = {
  accident: 1.4,
  congestion: 1.35,
  construction: 1.25,
  hazard: 1.3,
  weather: 1.5,
  natural_disaster: 2.5,
  road_closure: 1.1,
  vehicle_breakdown: 1.2,
  police_activity: 1.3,
  special_event: 1.4,
  other: 1.25,
};

export const DISRUPTION_TYPE_BOOST = {
  accident: 8,
  congestion: 6,
  construction: 7,
  hazard: 9,
  weather: 12,
  natural_disaster: 30,
  road_closure: 10,
  vehicle_breakdown: 5,
  police_activity: 8,
  special_event: 15,
  other: 7,
};

function toRad(value) {
  return (value * Math.PI) / 180;
}

function toDeg(value) {
  return (value * 180) / Math.PI;
}

function normalizeLon(lon) {
  const wrapped = ((lon + 540) % 360) - 180;
  return Number(wrapped.toFixed(6));
}

function normalizeLat(lat) {
  return Math.max(-89.999999, Math.min(89.999999, Number(lat.toFixed(6))));
}

export function clamp(min, max, value) {
  return Math.max(min, Math.min(max, value));
}

export function haversineKm(a, b) {
  const lat1 = toRad(a.lat);
  const lon1 = toRad(a.lon);
  const lat2 = toRad(b.lat);
  const lon2 = toRad(b.lon);

  const dLat = lat2 - lat1;
  const dLon = lon2 - lon1;

  const hav =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  const centralAngle = 2 * Math.atan2(Math.sqrt(hav), Math.sqrt(1 - hav));
  return EARTH_RADIUS_KM * centralAngle;
}

export function midpoint(a, b) {
  const lat1 = toRad(a.lat);
  const lon1 = toRad(a.lon);
  const lat2 = toRad(b.lat);
  const dLon = toRad(b.lon - a.lon);

  const bx = Math.cos(lat2) * Math.cos(dLon);
  const by = Math.cos(lat2) * Math.sin(dLon);

  const lat3 = Math.atan2(
    Math.sin(lat1) + Math.sin(lat2),
    Math.sqrt((Math.cos(lat1) + bx) ** 2 + by ** 2)
  );

  const lon3 = lon1 + Math.atan2(by, Math.cos(lat1) + bx);

  return {
    lat: normalizeLat(toDeg(lat3)),
    lon: normalizeLon(toDeg(lon3)),
  };
}

export function initialBearingRad(a, b) {
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLon = toRad(b.lon - a.lon);

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);

  return Math.atan2(y, x);
}

export function destinationPoint(start, bearingRad, distanceKm) {
  const angularDistance = distanceKm / EARTH_RADIUS_KM;

  const lat1 = toRad(start.lat);
  const lon1 = toRad(start.lon);

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance) +
      Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearingRad)
  );

  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(bearingRad) * Math.sin(angularDistance) * Math.cos(lat1),
      Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2)
    );

  return {
    lat: normalizeLat(toDeg(lat2)),
    lon: normalizeLon(toDeg(lon2)),
  };
}

export function perpendicularOffsetWaypoint(source, destination, offsetKm) {
  const mid = midpoint(source, destination);
  const bearing = initialBearingRad(source, destination);
  const perpendicularBearing = bearing + Math.PI / 2;

  return destinationPoint(mid, perpendicularBearing, offsetKm);
}

export function calculateRiskScore(distanceM, durationS, disruptionType = null) {
  const distanceKm = distanceM / 1000;
  const durationH = durationS / 3600;
  const base = Math.round(durationH * 6 + distanceKm * 0.02);
  const boost = disruptionType ? DISRUPTION_TYPE_BOOST[disruptionType] ?? 0 : 0;
  return clamp(5, 100, base + boost);
}

export function calculateCostUsd(distanceM, durationS) {
  const distanceKm = distanceM / 1000;
  const durationH = durationS / 3600;
  return Number((distanceKm * 1.2 + durationH * 40).toFixed(2));
}

const geocodeCache = new Map();
const GEOCODE_CACHE_MAX = 200;

function getCachedGeocode(key) {
  return geocodeCache.get(key) || null;
}

function setCachedGeocode(key, value) {
  if (geocodeCache.size >= GEOCODE_CACHE_MAX) {
    const oldestKey = geocodeCache.keys().next().value;
    geocodeCache.delete(oldestKey);
  }
  geocodeCache.set(key, value);
}

function buildCacheKey(lat, lon) {
  return `${lat.toFixed(4)},${lon.toFixed(4)}`;
}

function extractDisplayName(payload) {
  if (!payload || !payload.address) {
    return null;
  }

  const addr = payload.address;

  const place = addr.city || addr.town || addr.village || addr.hamlet || addr.suburb || addr.county || addr.state_district || null;
  const state = addr.state || addr.province || addr.region || null;
  const country = addr.country || null;

  if (place && country) {

    if (place === country) return place;
    return `${place}, ${country}`;
  }
  if (place && state) {
    return `${place}, ${state}`;
  }
  if (place) {
    return place;
  }
  if (state && country) {
    return `${state}, ${country}`;
  }
  if (country) {
    return country;
  }


  if (payload.display_name) {

    const parts = payload.display_name.split(",").map((s) => s.trim());
    if (parts.length >= 3) {
      return `${parts[0]}, ${parts[parts.length - 1]}`;
    }
    return parts[0];
  }

  return null;
}

async function nominatimFetch(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "supply-chain-route-intelligence/1.0" },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === "AbortError") {
      console.warn("Nominatim request timed out");
    }
    return null;
  }
}

export async function reverseGeocode({ lat, lon }) {
  const cacheKey = buildCacheKey(lat, lon);
  const cached = getCachedGeocode(cacheKey);
  if (cached) {
    return cached;
  }

  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&zoom=10&addressdetails=1`;
  const response = await nominatimFetch(url);
  if (!response || !response.ok) {
    return null;
  }

  try {
    const payload = await response.json();
    const name = extractDisplayName(payload);
    if (name) {
      setCachedGeocode(cacheKey, name);
    }
    return name;
  } catch (_error) {
    return null;
  }
}

export async function forwardGeocode(query, countryCodes = "") {
  if (!query || query.trim().length < 2) {
    return null;
  }

  const cacheKey = `fwd:${query.trim().toLowerCase()}:${countryCodes}`;
  const cached = getCachedGeocode(cacheKey);
  if (cached) {
    return cached;
  }

  const countryParam = countryCodes ? `&countrycodes=${encodeURIComponent(countryCodes)}` : "";
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query.trim())}&limit=1${countryParam}`;
  const response = await nominatimFetch(url);
  if (!response || !response.ok) {
    return null;
  }

  try {
    const payload = await response.json();
    if (Array.isArray(payload) && payload.length > 0) {
      const result = {
        lat: Number(payload[0].lat),
        lon: Number(payload[0].lon),
        name: payload[0].display_name,
      };
      setCachedGeocode(cacheKey, result);
      return result;
    }
    return null;
  } catch (_error) {
    return null;
  }
}
