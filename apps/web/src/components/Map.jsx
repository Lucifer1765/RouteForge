import { useEffect, useRef } from "preact/hooks";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

function toLatLngList(route) {
  if (!route?.geometry?.coordinates) {
    return [];
  }
  return route.geometry.coordinates.map(([lon, lat]) => [lat, lon]);
}

function createPinIcon(label, className, testId) {
  return L.divIcon({
    className: "",
    html: `<div class=\"map-pin ${className}\" data-testid=\"${testId}\">${label}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

function createDisruptionIcon() {
  return L.divIcon({
    className: "",
    html: '<div class="map-disruption" data-testid="disruption-marker">!</div>',
    iconSize: [38, 38],
    iconAnchor: [19, 19],
  });
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDisruptionType(incident, fallbackType) {
  const raw = incident?.category || incident?.type || fallbackType || "unknown disruption";
  return String(raw).replace(/_/g, " ").toLowerCase();
}

function buildTooltipMarkup({ incident, index, delayMinutes, fallbackType }) {
  const locationName =
    incident?.location_name ||
    incident?.locationName ||
    incident?.name ||
    `Route segment ${index + 1}`;
  const typeLabel = formatDisruptionType(incident, fallbackType);
  const cause = incident?.description || "Live disruption detected near the route corridor.";
  const safeDelay = Number.isFinite(delayMinutes) ? Math.max(0, delayMinutes) : 0;

  return `
    <div class="disruption-tooltip-card" data-testid="disruption-tooltip-card">
      <div class="tooltip-location">${escapeHtml(locationName)}</div>
      <div class="tooltip-type">${escapeHtml(typeLabel)}</div>
      <div class="tooltip-cause">${escapeHtml(cause)}</div>
      <div class="tooltip-delay">Estimated delay: ${safeDelay} min</div>
    </div>
  `;
}

function findIncidentForLocation(incidents, location, index) {
  if (!Array.isArray(incidents) || incidents.length === 0) {
    return null;
  }

  const indexed = incidents[index];
  if (
    indexed?.location &&
    Math.abs(indexed.location.lat - location.lat) < 0.00001 &&
    Math.abs(indexed.location.lon - location.lon) < 0.00001
  ) {
    return indexed;
  }

  return (
    incidents.find((incident) => {
      const lat = Number(incident?.location?.lat ?? incident?.lat);
      const lon = Number(incident?.location?.lon ?? incident?.lon);
      return Math.abs(lat - location.lat) < 0.00001 && Math.abs(lon - location.lon) < 0.00001;
    }) || indexed || null
  );
}

export default function Map({
  source,
  destination,
  baselineRoute,
  rerouteRoute,
  activeDisruption,
  playbackStep,
  laneLabel,
  selectionMode,
  selectedLiveDisruptions,
  estimatedDelayMinutes,
  onMapClick,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layersRef = useRef(null);
  const clickIndicatorRef = useRef(null);
  const onMapClickRef = useRef(onMapClick);
  const selectionModeRef = useRef(selectionMode);

  useEffect(() => {
    onMapClickRef.current = onMapClick;
  }, [onMapClick]);

  useEffect(() => {
    selectionModeRef.current = selectionMode;
  }, [selectionMode]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return undefined;
    }

    const map = L.map(containerRef.current, {
      zoomControl: true,
      worldCopyJump: true,
    }).setView([20, 0], 2);

    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      crossOrigin: true,
      subdomains: "abcd",
    }).addTo(map);

    layersRef.current = {
      markers: L.layerGroup().addTo(map),
      routes: L.layerGroup().addTo(map),
      alerts: L.layerGroup().addTo(map),
    };

    const clickHandler = (event) => {
      if (!selectionModeRef.current) {
        return;
      }

      const callback = onMapClickRef.current;
      if (typeof callback === "function") {
        callback(event.latlng);
      }

      if (clickIndicatorRef.current) {
        clickIndicatorRef.current.remove();
      }

      clickIndicatorRef.current = L.marker([event.latlng.lat, event.latlng.lng], {
        icon: createPinIcon("?", "map-pin-click", "click-indicator"),
      }).addTo(layersRef.current.markers);
    };

    map.on("click", clickHandler);

    setTimeout(() => {
      map.invalidateSize();
    }, 100);

    mapRef.current = map;

    return () => {
      map.off("click", clickHandler);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !layersRef.current) {
      return;
    }

    mapRef.current.invalidateSize();
    mapRef.current.getContainer().style.cursor = selectionMode ? "crosshair" : "";

    const { markers, routes, alerts } = layersRef.current;
    markers.clearLayers();
    routes.clearLayers();
    alerts.clearLayers();

    const boundsPoints = [];

    if (source) {
      const sourcePoint = [source.lat, source.lon];
      boundsPoints.push(sourcePoint);
      L.marker(sourcePoint, {
        icon: createPinIcon("A", "map-pin-a", "origin-marker"),
      }).addTo(markers);
    }

    if (destination) {
      const destinationPoint = [destination.lat, destination.lon];
      boundsPoints.push(destinationPoint);
      L.marker(destinationPoint, {
        icon: createPinIcon("B", "map-pin-b", "destination-marker"),
      }).addTo(markers);
    }

    const baselineLine = toLatLngList(baselineRoute);
    const rerouteLine = toLatLngList(rerouteRoute);

    if (baselineLine.length > 1 && playbackStep <= 1) {
      L.polyline(baselineLine, {
        color: "#0A5E63",
        weight: 5,
        opacity: 1,
        className: "route-line route-line-baseline",
      }).addTo(routes);
      boundsPoints.push(...baselineLine);
    }

    if (baselineLine.length > 1 && playbackStep === 2) {
      L.polyline(baselineLine, {
        color: "#0A5E63",
        weight: 5,
        opacity: rerouteLine.length > 1 ? 0.35 : 1,
        dashArray: rerouteLine.length > 1 ? "10 8" : undefined,
        className: "route-line route-line-baseline-muted",
      }).addTo(routes);
      boundsPoints.push(...baselineLine);
    }

    if (playbackStep === 2 && rerouteLine.length > 1) {
      L.polyline(rerouteLine, {
        color: "#E8642C",
        weight: 5,
        opacity: 1,
        className: "route-line route-line-reroute",
      }).addTo(routes);
      boundsPoints.push(...rerouteLine);
    }

    const activeLocations = playbackStep >= 1 && activeDisruption?.locations
      ? activeDisruption.locations.map((location, index) => {
          const incident = findIncidentForLocation(activeDisruption.incidents, location, index);
          return { location, incident };
        })
      : [];

    const selectedLocations = activeLocations.length === 0
      ? (selectedLiveDisruptions || [])
          .map((incident) => {
            const lat = Number(incident?.location?.lat ?? incident?.lat);
            const lon = Number(incident?.location?.lon ?? incident?.lon);
            if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
              return null;
            }
            return {
              location: { lat, lon },
              incident,
            };
          })
          .filter(Boolean)
      : [];

    const disruptionPoints = activeLocations.length > 0 ? activeLocations : selectedLocations;
    const distributedDelay = disruptionPoints.length > 0
      ? Math.max(1, Math.round((estimatedDelayMinutes || 0) / disruptionPoints.length))
      : 0;

    disruptionPoints.forEach((entry, index) => {
      const disruptionPoint = [entry.location.lat, entry.location.lon];
      boundsPoints.push(disruptionPoint);

      const marker = L.marker(disruptionPoint, { icon: createDisruptionIcon() }).addTo(alerts);
      marker.bindTooltip(
        buildTooltipMarkup({
          incident: entry.incident,
          index,
          delayMinutes: distributedDelay,
          fallbackType: activeDisruption?.type,
        }),
        {
          direction: "top",
          offset: [0, -22],
          sticky: true,
          opacity: 1,
          className: "disruption-tooltip-shell",
        }
      );
    });

    if (boundsPoints.length > 1) {
      const bounds = L.latLngBounds(boundsPoints);
      mapRef.current.fitBounds(bounds, { padding: [32, 32], maxZoom: 12 });
    }
  }, [
    source,
    destination,
    baselineRoute,
    rerouteRoute,
    activeDisruption,
    playbackStep,
    selectedLiveDisruptions,
    estimatedDelayMinutes,
  ]);

  const disruptionLabel = activeDisruption?.type
    ? activeDisruption.type === "multiple_disruptions"
      ? `${activeDisruption.locations.length} disruptions`
      : activeDisruption.type.replace(/_/g, " ")
    : "no active disruption";

  const selectionHint = selectionMode
    ? `Click the map to choose ${selectionMode}`
    : "Click source/destination above to activate map selection";

  return (
    <div className="map-shell" data-testid="map-shell">
      <div ref={containerRef} className="map-canvas" data-testid="route-map-canvas" />

      <div className="floating-banner" data-testid="lane-banner">
        <span>{laneLabel || "Custom lane"}</span>
        <span className={`banner-chip ${activeDisruption?.type ? "active" : ""}`} data-testid="active-disruption-chip">
          {disruptionLabel}
        </span>
        <div className="banner-hint">{selectionHint}</div>
      </div>

      <div className="floating-legend" data-testid="map-legend">
        <div className="legend-item">
          <span className="legend-line legend-original" />
          <span>Original</span>
        </div>
        <div className="legend-item">
          <span className="legend-line legend-reroute" />
          <span>Reroute</span>
        </div>
      </div>
    </div>
  );
}
