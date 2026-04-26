import { useEffect, useState } from "preact/hooks";
import ChatBox from "./components/ChatBox.jsx";
import Map from "./components/Map.jsx";
import MetricsPanel from "./components/MetricsPanel.jsx";
import PlaybackBar from "./components/PlaybackBar.jsx";
import ReasoningCard from "./components/ReasoningCard.jsx";
import ScenarioForm from "./components/ScenarioForm.jsx";
import {
  computeOptimizedRoute,
  computeAlternateRoute,
  fetchReasoning,
  fetchScenario,
  fetchScenarios,
  sendScenarioChat,
} from "./lib/api.js";

function parsePoint(point) {
  const lat = Number.parseFloat(point?.lat);
  const lon = Number.parseFloat(point?.lon);

  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    throw new Error("Select both source and destination on the map before computing.");
  }

  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    throw new Error("Coordinates are out of range (lat: -90 to 90, lon: -180 to 180)");
  }

  return { lat, lon };
}

function safeParsePoint(point) {
  try {
    return parsePoint(point);
  } catch (_error) {
    return null;
  }
}

function findEvent(events, kind) {
  return events.find((event) => event.kind === kind) || null;
}

function parseScenarioLabel(label) {
  if (!label || typeof label !== "string") {
    return {
      sourceName: "",
      destinationName: "",
    };
  }

  const parts = label.split(/\s*(?:→|->)\s*/);
  if (parts.length < 2) {
    return {
      sourceName: "",
      destinationName: "",
    };
  }

  return {
    sourceName: parts[0].trim(),
    destinationName: parts.slice(1).join(" → ").trim(),
  };
}

function buildScenarioLabel(routeSetup) {
  const sourceName = routeSetup.sourceName.trim() || "Source";
  const destinationName = routeSetup.destinationName.trim() || "Destination";
  return `${sourceName} → ${destinationName}`;
}

function clearRoutingForDraft(current, nextRouteSetup) {
  return {
    ...current,
    routeSetup: nextRouteSetup,
    scenario: {
      ...current.scenario,
      id: null,
      label: buildScenarioLabel(nextRouteSetup),
    },
    routes: {
      ...current.routes,
      baselineRoute: null,
      baselineMetrics: null,
      rerouteRoute: null,
      rerouteMetrics: null,
      activeDisruption: null,
      liveDisruptions: [],
      selectedLiveDisruptions: [],
    },
    reasoning: {
      ...current.reasoning,
      text: "Compute a route to begin.",
      chatMessages: [],
    },
    playback: {
      ...current.playback,
      step: 0,
      isPlaying: false,
    },
  };
}

export default function App() {
  const [appState, setAppState] = useState({
    routeSetup: {
      sourcePoint: null,
      destinationPoint: null,
      sourceName: "",
      destinationName: "",
      mapSelectionMode: null,
    },
    scenario: {
      id: null,
      label: "Source → Destination",
      savedScenarios: [],
    },
    routes: {
      baselineRoute: null,
      baselineMetrics: null,
      rerouteRoute: null,
      rerouteMetrics: null,
      activeDisruption: null,
      liveDisruptions: [],
      selectedLiveDisruptions: [],
    },
    reasoning: {
      text: "Compute a route to begin.",
      chatMessages: [],
    },
    playback: {
      step: 0,
      isPlaying: false,
    },
    controls: {
      vehicleSpeed: 80,
    },
    loading: {
      compute: false,
      alternate: false,
      reasoning: false,
      chat: false,
    },
    ui: {
      errorMessage: "",
    },
  });

  async function refreshScenarios() {
    const payload = await fetchScenarios();
    setAppState((current) => ({
      ...current,
      scenario: {
        ...current.scenario,
        savedScenarios: payload.scenarios || [],
      },
    }));
  }

  useEffect(() => {
    refreshScenarios().catch(() => {
      setAppState((current) => ({
        ...current,
        scenario: {
          ...current.scenario,
          savedScenarios: [],
        },
      }));
    });
  }, []);

  useEffect(() => {
    if (!appState.playback.isPlaying) {
      return undefined;
    }

    const interval = setInterval(() => {
      setAppState((current) => {
        if (current.playback.step >= 2) {
          return {
            ...current,
            playback: {
              ...current.playback,
              step: 2,
              isPlaying: false,
            },
          };
        }

        return {
          ...current,
          playback: {
            ...current.playback,
            step: current.playback.step + 1,
          },
        };
      });
    }, 1100);

    return () => clearInterval(interval);
  }, [appState.playback.isPlaying]);

  function handleMapClick(point) {
    if (!appState.routeSetup.mapSelectionMode || !point) {
      return;
    }

    const lat = Number(point.lat.toFixed(6));
    const lon = Number(point.lng.toFixed(6));

    setAppState((current) => {
      const scope = current.routeSetup.mapSelectionMode;
      if (!scope) {
        return current;
      }

      const pointKey = scope === "source" ? "sourcePoint" : "destinationPoint";
      const nameKey = scope === "source" ? "sourceName" : "destinationName";
      const fallbackName = scope === "source" ? "Source" : "Destination";

      const nextRouteSetup = {
        ...current.routeSetup,
        [pointKey]: { lat, lon },
        [nameKey]: current.routeSetup[nameKey] || fallbackName,
        mapSelectionMode: null,
      };

      return clearRoutingForDraft(current, nextRouteSetup);
    });
  }

  function handleMapSelectionMode(mode) {
    setAppState((current) => ({
      ...current,
      routeSetup: {
        ...current.routeSetup,
        mapSelectionMode: current.routeSetup.mapSelectionMode === mode ? null : mode,
      },
    }));
  }

  function handleLocationNameChange(scope, value) {
    setAppState((current) => {
      const key = scope === "source" ? "sourceName" : "destinationName";
      const nextRouteSetup = {
        ...current.routeSetup,
        [key]: value,
      };
      return clearRoutingForDraft(current, nextRouteSetup);
    });
  }

  async function handleComputeRoute() {
    try {
      setAppState((current) => ({
        ...current,
        loading: {
          ...current.loading,
          compute: true,
        },
        ui: {
          ...current.ui,
          errorMessage: "",
        },
      }));

      const source = parsePoint(appState.routeSetup.sourcePoint);
      const destination = parsePoint(appState.routeSetup.destinationPoint);
      const requestedLabel = buildScenarioLabel(appState.routeSetup);
      const payload = await computeOptimizedRoute({
        source,
        destination,
        label: requestedLabel,
      });

      const parsedNames = parseScenarioLabel(payload.label || requestedLabel);

      setAppState((current) => ({
        ...current,
        routeSetup: {
          ...current.routeSetup,
          sourceName: parsedNames.sourceName || current.routeSetup.sourceName || "Source",
          destinationName:
            parsedNames.destinationName ||
            current.routeSetup.destinationName ||
            "Destination",
          mapSelectionMode: null,
        },
        scenario: {
          ...current.scenario,
          id: payload.scenario_id,
          label: payload.label || requestedLabel,
        },
        routes: {
          ...current.routes,
          baselineRoute: payload.route,
          baselineMetrics: {
            distance_m: payload.route.distance_m,
            duration_s: payload.route.duration_s,
            risk_score: payload.route.risk_score ?? payload.risk_score,
            cost_usd: payload.route.cost_usd ?? payload.cost_usd,
          },
          rerouteRoute: null,
          rerouteMetrics: null,
          activeDisruption: null,
          liveDisruptions: payload.live_disruptions || [],
          selectedLiveDisruptions: [],
        },
        reasoning: {
          ...current.reasoning,
          text: payload.reasoning || "Route computed.",
          chatMessages: [],
        },
        playback: {
          ...current.playback,
          step: 0,
          isPlaying: false,
        },
      }));

      await refreshScenarios();
    } catch (error) {
      setAppState((current) => ({
        ...current,
        ui: {
          ...current.ui,
          errorMessage: error.message || "Failed to compute route",
        },
      }));
    } finally {
      setAppState((current) => ({
        ...current,
        loading: {
          ...current.loading,
          compute: false,
        },
      }));
    }
  }

  async function handleComputeAlternateRoute() {
    if (!appState.scenario.id || appState.routes.selectedLiveDisruptions.length === 0) {
      return;
    }

    try {
      setAppState((current) => ({
        ...current,
        loading: {
          ...current.loading,
          alternate: true,
        },
        ui: {
          ...current.ui,
          errorMessage: "",
        },
      }));

      const payload = await computeAlternateRoute({
        scenario_id: appState.scenario.id,
        incidents: appState.routes.selectedLiveDisruptions,
      });

      setAppState((current) => ({
        ...current,
        routes: {
          ...current.routes,
          rerouteRoute: payload.reroute,
          rerouteMetrics: {
            distance_m: payload.reroute.distance_m,
            duration_s: payload.reroute.duration_s,
            risk_score: payload.reroute.risk_score,
            cost_usd: payload.reroute.cost_usd,
          },
          activeDisruption: payload.disruption,
        },
        reasoning: {
          ...current.reasoning,
          text: payload.reasoning || "Alternate route computed.",
        },
        playback: {
          ...current.playback,
          step: 2,
          isPlaying: false,
        },
      }));

      await refreshScenarios();
    } catch (error) {
      setAppState((current) => ({
        ...current,
        ui: {
          ...current.ui,
          errorMessage: error.message || "Failed to compute alternate route",
        },
      }));
    } finally {
      setAppState((current) => ({
        ...current,
        loading: {
          ...current.loading,
          alternate: false,
        },
      }));
    }
  }

  function handleSelectLiveDisruption(disruption) {
    setAppState((current) => {
      const isSelected = current.routes.selectedLiveDisruptions.some(
        (item) => item.id === disruption.id
      );

      return {
        ...current,
        routes: {
          ...current.routes,
          selectedLiveDisruptions: isSelected
            ? current.routes.selectedLiveDisruptions.filter((item) => item.id !== disruption.id)
            : [...current.routes.selectedLiveDisruptions, disruption],
        },
      };
    });
  }

  async function handleLoadScenario(nextScenarioId) {
    try {
      setAppState((current) => ({
        ...current,
        ui: {
          ...current.ui,
          errorMessage: "",
        },
      }));

      const scenario = await fetchScenario(nextScenarioId);

      const parsedNames = parseScenarioLabel(scenario.label);

      const initial = findEvent(scenario.events || [], "initial_route");
      const reroute = findEvent(scenario.events || [], "reroute");

      setAppState((current) => ({
        ...current,
        routeSetup: {
          ...current.routeSetup,
          sourcePoint: {
            lat: Number(scenario.source.lat),
            lon: Number(scenario.source.lon),
          },
          destinationPoint: {
            lat: Number(scenario.destination.lat),
            lon: Number(scenario.destination.lon),
          },
          sourceName: parsedNames.sourceName || current.routeSetup.sourceName || "Source",
          destinationName:
            parsedNames.destinationName ||
            current.routeSetup.destinationName ||
            "Destination",
          mapSelectionMode: null,
        },
        scenario: {
          ...current.scenario,
          id: scenario.scenario_id,
          label: scenario.label || buildScenarioLabel(current.routeSetup),
        },
        routes: {
          ...current.routes,
          baselineRoute: initial?.route || null,
          baselineMetrics: initial
            ? {
                distance_m: initial.route.distance_m,
                duration_s: initial.route.duration_s,
                risk_score: initial.risk_score,
                cost_usd: initial.cost_usd,
              }
            : null,
          rerouteRoute: reroute?.route || null,
          rerouteMetrics: reroute
            ? {
                distance_m: reroute.route.distance_m,
                duration_s: reroute.route.duration_s,
                risk_score: reroute.risk_score,
                cost_usd: reroute.cost_usd,
              }
            : null,
          activeDisruption: scenario.active_disruption || null,
          liveDisruptions: [],
          selectedLiveDisruptions: [],
        },
        reasoning: {
          ...current.reasoning,
          text: scenario.reasoning || "Loaded scenario",
          chatMessages: [],
        },
        playback: {
          ...current.playback,
          step: reroute ? 2 : 0,
          isPlaying: false,
        },
      }));
    } catch (error) {
      setAppState((current) => ({
        ...current,
        ui: {
          ...current.ui,
          errorMessage: error.message || "Failed to load scenario",
        },
      }));
    }
  }

  async function handleRefreshReasoning() {
    if (!appState.scenario.id || appState.loading.reasoning) {
      return;
    }

    try {
      setAppState((current) => ({
        ...current,
        loading: {
          ...current.loading,
          reasoning: true,
        },
        ui: {
          ...current.ui,
          errorMessage: "",
        },
      }));

      const payload = await fetchReasoning(appState.scenario.id);

      setAppState((current) => ({
        ...current,
        reasoning: {
          ...current.reasoning,
          text: payload.reasoning || "Reasoning refreshed.",
        },
      }));
    } catch (error) {
      setAppState((current) => ({
        ...current,
        ui: {
          ...current.ui,
          errorMessage: error.message || "Failed to refresh reasoning",
        },
      }));
    } finally {
      setAppState((current) => ({
        ...current,
        loading: {
          ...current.loading,
          reasoning: false,
        },
      }));
    }
  }

  async function handleSendChat(message) {
    if (!appState.scenario.id) {
      setAppState((current) => ({
        ...current,
        ui: {
          ...current.ui,
          errorMessage: "Compute a route before using chat",
        },
      }));
      return;
    }

    setAppState((current) => ({
      ...current,
      reasoning: {
        ...current.reasoning,
        chatMessages: [...current.reasoning.chatMessages, { role: "user", text: message }],
      },
      loading: {
        ...current.loading,
        chat: true,
      },
    }));

    try {
      const payload = await sendScenarioChat(appState.scenario.id, message);

      setAppState((current) => ({
        ...current,
        reasoning: {
          ...current.reasoning,
          chatMessages: [...current.reasoning.chatMessages, { role: "assistant", text: payload.reply }],
        },
      }));
    } catch (error) {
      setAppState((current) => ({
        ...current,
        reasoning: {
          ...current.reasoning,
          chatMessages: [
            ...current.reasoning.chatMessages,
            { role: "assistant", text: error.message || "Chat unavailable right now." },
          ],
        },
      }));
    } finally {
      setAppState((current) => ({
        ...current,
        loading: {
          ...current.loading,
          chat: false,
        },
      }));
    }
  }

  function handleTogglePlay() {
    setAppState((current) => {
      if (current.playback.isPlaying) {
        return {
          ...current,
          playback: {
            ...current.playback,
            isPlaying: false,
          },
        };
      }

      return {
        ...current,
        playback: {
          ...current.playback,
          step: current.playback.step === 2 ? 0 : current.playback.step,
          isPlaying: true,
        },
      };
    });
  }

  function handleStepChange(step) {
    setAppState((current) => ({
      ...current,
      playback: {
        ...current.playback,
        step,
        isPlaying: false,
      },
    }));
  }

  const canComputeRoute = Boolean(
    safeParsePoint(appState.routeSetup.sourcePoint) &&
      safeParsePoint(appState.routeSetup.destinationPoint)
  );
  const laneLabel = appState.scenario.label || buildScenarioLabel(appState.routeSetup);
  const estimatedDelayMinutes =
    Number.isFinite(appState.routes.rerouteMetrics?.duration_s) &&
    Number.isFinite(appState.routes.baselineMetrics?.duration_s)
      ? Math.max(
          0,
          Math.round(
            (appState.routes.rerouteMetrics.duration_s -
              appState.routes.baselineMetrics.duration_s) /
              60
          )
        )
      : 0;

  return (
    <div className="app-shell" data-testid="app-shell">
      <header className="topbar" data-testid="topbar">
        <div className="brand">
          <div className="brand-icon">RF</div>
          RouteForge
        </div>
        <div className="topbar-meta">
          <span className={`status-dot ${appState.scenario.id ? "" : "offline"}`} />
          {appState.scenario.id ? "Scenario active" : "No scenario"}
          <span style={{ color: "var(--border-default)" }}>|</span>
          OSRM · Driving
        </div>
      </header>

      <main className="dashboard-grid">
        <section className="panel left-panel">
          <ScenarioForm
            routeSetup={appState.routeSetup}
            onLocationNameChange={handleLocationNameChange}
            onCompute={handleComputeRoute}
            canCompute={canComputeRoute}
            isComputing={appState.loading.compute}
            onMapSelectionModeChange={handleMapSelectionMode}
            mapSelectionMode={appState.routeSetup.mapSelectionMode}
            onComputeAlternateRoute={handleComputeAlternateRoute}
            isComputingAlternate={appState.loading.alternate}
            canComputeAlternate={!!appState.scenario.id}
            liveDisruptions={appState.routes.liveDisruptions}
            selectedLiveDisruptions={appState.routes.selectedLiveDisruptions}
            onSelectLiveDisruption={handleSelectLiveDisruption}
            savedScenarios={appState.scenario.savedScenarios}
            onLoadScenario={handleLoadScenario}
          />
        </section>

        <section className="panel map-panel">
          <Map
            source={safeParsePoint(appState.routeSetup.sourcePoint)}
            destination={safeParsePoint(appState.routeSetup.destinationPoint)}
            baselineRoute={appState.routes.baselineRoute}
            rerouteRoute={appState.routes.rerouteRoute}
            activeDisruption={appState.routes.activeDisruption}
            playbackStep={appState.playback.step}
            laneLabel={laneLabel}
            selectionMode={appState.routeSetup.mapSelectionMode}
            selectedLiveDisruptions={appState.routes.selectedLiveDisruptions}
            estimatedDelayMinutes={estimatedDelayMinutes}
            onMapClick={handleMapClick}
          />
        </section>

        <section className="panel right-panel">
          <div className="right-split-layout" data-testid="right-split-layout">
            <div className="right-split-top" data-testid="right-split-top">
              <MetricsPanel
                baselineMetrics={appState.routes.baselineMetrics}
                rerouteMetrics={appState.routes.rerouteMetrics}
                activeDisruption={appState.routes.activeDisruption}
                vehicleSpeed={appState.controls.vehicleSpeed}
                onVehicleSpeedChange={(nextSpeed) => {
                  setAppState((current) => ({
                    ...current,
                    controls: {
                      ...current.controls,
                      vehicleSpeed: nextSpeed,
                    },
                  }));
                }}
              />
            </div>

            <div className="right-split-bottom" data-testid="right-split-bottom">
              <ReasoningCard
                reasoning={appState.reasoning.text}
                onRefresh={handleRefreshReasoning}
                canRefresh={!!appState.scenario.id}
                isRefreshing={appState.loading.reasoning}
              />
              <ChatBox
                messages={appState.reasoning.chatMessages}
                onSend={handleSendChat}
                isLoading={appState.loading.chat}
                isDisabled={!appState.scenario.id}
              />
            </div>
          </div>
        </section>
      </main>

      {appState.ui.errorMessage ? (
        <div className="error-toast" data-testid="error-toast">
          <span className="lucide" data-lucide="alert-circle" style={{ width: 16, height: 16, flexShrink: 0 }} />
          <span>{appState.ui.errorMessage}</span>
          <button
            type="button"
            className="btn btn-subtle btn-sm"
            onClick={() => {
              setAppState((current) => ({
                ...current,
                ui: {
                  ...current.ui,
                  errorMessage: "",
                },
              }));
            }}
            data-testid="error-toast-dismiss-button"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <footer className="playback-footer">
        <PlaybackBar
          playbackStep={appState.playback.step}
          onStepChange={handleStepChange}
          isPlaying={appState.playback.isPlaying}
          onTogglePlay={handleTogglePlay}
        />
      </footer>
    </div>
  );
}
