import { useEffect, useRef, useState } from "preact/hooks";

function formatDisruptionTitle(disruption) {
  const category = disruption.category?.replace(/_/g, " ") || disruption.type?.replace(/_/g, " ") || "Unknown";
  return category;
}

function getSeverityBadgeClass(severity) {
  switch (String(severity).toLowerCase()) {
    case "low":
      return "severity-badge-low";
    case "medium":
      return "severity-badge-medium";
    case "high":
      return "severity-badge-high";
    default:
      return "severity-badge-high";
  }
}

function formatScenarioLabel(scenario) {
  const disruption = scenario.active_disruption?.type
    ? ` \u00b7 ${scenario.active_disruption.type.replace(/_/g, " ")}`
    : "";
  return `${scenario.label}${disruption}`;
}

function buildDisruptionItem(incident) {
  const location = incident.location || (incident.lat != null && incident.lon != null
    ? { lat: incident.lat, lon: incident.lon }
    : null);
  const id = incident.id || `${incident.type || "incident"}-${location?.lat ?? "na"}-${location?.lon ?? "na"}`;

  return {
    ...incident,
    id,
    location,
  };
}

export default function ScenarioForm({
  routeSetup,
  onLocationNameChange,
  onCompute,
  canCompute,
  isComputing,
  onMapSelectionModeChange,
  mapSelectionMode,
  onComputeAlternateRoute,
  isComputingAlternate,
  canComputeAlternate,
  liveDisruptions,
  selectedLiveDisruptions,
  onSelectLiveDisruption,
  savedScenarios,
  onLoadScenario,
}) {
  const [isDisruptionMenuOpen, setIsDisruptionMenuOpen] = useState(false);
  const disruptionMenuRef = useRef(null);

  useEffect(() => {
    if (!isDisruptionMenuOpen) {
      return undefined;
    }

    function handleDocumentClick(event) {
      if (!disruptionMenuRef.current?.contains(event.target)) {
        setIsDisruptionMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleDocumentClick);
    return () => {
      document.removeEventListener("mousedown", handleDocumentClick);
    };
  }, [isDisruptionMenuOpen]);

  const sourceSelected = Boolean(routeSetup.sourcePoint);
  const destinationSelected = Boolean(routeSetup.destinationPoint);
  const routeName = `${routeSetup.sourceName.trim() || "Source"} → ${routeSetup.destinationName.trim() || "Destination"}`;
  const disruptionOptions = liveDisruptions.map(buildDisruptionItem);
  const selectedCount = selectedLiveDisruptions?.length || 0;

  return (
    <div className="scenario-form">
      <div className="section-title-row">
        <span className="dot" />
        <span className="section-title">Route setup</span>
      </div>

      <div className="field-note">
        Select source and destination directly on the map. Coordinates are stored internally and not editable.
      </div>

      <div className="map-selection-controls">
        <button
          type="button"
          className={`btn btn-subtle ${mapSelectionMode === "source" ? "active" : ""}`}
          onClick={() => onMapSelectionModeChange("source")}
          data-testid="select-source-button"
        >
          {sourceSelected ? "Source selected" : "Select source on map"}
        </button>
        <button
          type="button"
          className={`btn btn-subtle ${mapSelectionMode === "destination" ? "active" : ""}`}
          onClick={() => onMapSelectionModeChange("destination")}
          data-testid="select-destination-button"
        >
          {destinationSelected ? "Destination selected" : "Select destination on map"}
        </button>
      </div>

      <div className="coord-grid">
        <label className="field-label" htmlFor="source-name-input">
          Source name
        </label>
        <input
          id="source-name-input"
          className="input"
          value={routeSetup.sourceName}
          onInput={(event) => onLocationNameChange("source", event.currentTarget.value)}
          placeholder="Warehouse Alpha"
          data-testid="source-name-input"
        />

        <label className="field-label" htmlFor="destination-name-input">
          Destination name
        </label>
        <input
          id="destination-name-input"
          className="input"
          value={routeSetup.destinationName}
          onInput={(event) => onLocationNameChange("destination", event.currentTarget.value)}
          placeholder="Distribution Hub"
          data-testid="destination-name-input"
        />
      </div>

      <div className="field-note" data-testid="route-name-preview">
        {sourceSelected && destinationSelected
          ? `Scenario label: ${routeName}`
          : "Choose both map points to enable route computation."}
      </div>

      <button
        type="button"
        className="btn btn-primary"
        onClick={onCompute}
        disabled={isComputing || !canCompute}
        data-testid="compute-optimized-route-button"
      >
        {isComputing ? (
          <>
            <span className="spinner" />
            Computing optimized route
          </>
        ) : (
          "Compute optimized route"
        )}
      </button>

      <div className="section-title-row">
        <span className="dot" />
        <span className="section-title">Disruptions</span>
      </div>

      {disruptionOptions.length > 0 ? (
        <div className="live-disruptions-selection">
          <div className="field-note">
            Select one or more disruptions for alternate route computation.
          </div>
          <div className="disruption-multi-select" ref={disruptionMenuRef}>
            <button
              type="button"
              className="btn btn-subtle disruption-select-trigger"
              onClick={() => setIsDisruptionMenuOpen((current) => !current)}
              data-testid="disruption-multiselect-trigger"
            >
              <span>
                {selectedCount > 0
                  ? `${selectedCount} disruption${selectedCount > 1 ? "s" : ""} selected`
                  : "Select disruptions"}
              </span>
              <span className={`disruption-trigger-caret ${isDisruptionMenuOpen ? "open" : ""}`}>▾</span>
            </button>

            {isDisruptionMenuOpen ? (
              <div className="disruption-dropdown-menu" data-testid="disruption-dropdown-menu">
                {disruptionOptions.map((incident) => {
                  const isSelected = Boolean(
                    selectedLiveDisruptions &&
                      selectedLiveDisruptions.some((item) => item.id === incident.id)
                  );

                  return (
                    <button
                      type="button"
                      key={incident.id}
                      className={`disruption-option ${isSelected ? "selected" : ""}`}
                      onClick={() => onSelectLiveDisruption(incident)}
                      data-testid={`select-live-disruption-${incident.id}`}
                    >
                      <span className={`disruption-check ${isSelected ? "checked" : ""}`}>{isSelected ? "✓" : ""}</span>
                      <span className="disruption-option-content">
                        <span className="disruption-title-row">
                          <span className="disruption-title">{formatDisruptionTitle(incident)}</span>
                          <span className={`disruption-severity ${getSeverityBadgeClass(incident.severity)}`}>
                            {incident.severity || "High"}
                          </span>
                        </span>
                        <span className="disruption-description">{incident.description}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>

          <div className="selected-disruption-chips" data-testid="selected-disruption-chips">
            {selectedCount === 0 ? (
              <div className="field-note">No disruptions selected</div>
            ) : (
              selectedLiveDisruptions.map((incident) => {
                const enriched = buildDisruptionItem(incident);
                return (
                  <button
                    type="button"
                    key={enriched.id}
                    className="disruption-chip"
                    onClick={() => onSelectLiveDisruption(enriched)}
                    data-testid={`selected-disruption-chip-${enriched.id}`}
                  >
                    <span>{formatDisruptionTitle(enriched)}</span>
                    <span className="chip-remove">×</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : (
        <div className="field-note">
          No disruptions found near the route. Configure real traffic/incident APIs and refresh the route to load live events.
        </div>
      )}

      <button
        type="button"
        className="btn btn-amber"
        onClick={onComputeAlternateRoute}
        disabled={!canComputeAlternate || isComputingAlternate || !selectedLiveDisruptions || selectedLiveDisruptions.length === 0}
        data-testid="compute-alternate-route-button"
      >
        {isComputingAlternate ? (
          <>
            <span className="spinner" />
            Computing alternate route
          </>
        ) : (
          `Compute alternate route (${selectedLiveDisruptions ? selectedLiveDisruptions.length : 0} disruption${selectedLiveDisruptions && selectedLiveDisruptions.length !== 1 ? "s" : ""})`
        )}
      </button>

      <div className="section-title-row">
        <span className="dot" />
        <span className="section-title">Saved scenarios</span>
      </div>

      <div className="saved-scenarios" data-testid="saved-scenarios-list">
        {savedScenarios.length === 0 ? (
          <div className="empty-label">No scenarios yet</div>
        ) : (
          savedScenarios.map((scenario) => (
            <button
              type="button"
              key={scenario.scenario_id}
              className="saved-scenario-item"
              onClick={() => onLoadScenario(scenario.scenario_id)}
              data-testid={`saved-scenario-${scenario.scenario_id}`}
            >
              {formatScenarioLabel(scenario)}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
