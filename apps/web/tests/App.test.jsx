import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("../src/components/Map.jsx", () => ({
  default: () => <div data-testid="map-component">Map mock</div>,
}));

vi.mock("../src/lib/api.js", () => ({
  computeOptimizedRoute: vi.fn(),
  computeAlternateRoute: vi.fn(),
  fetchReasoning: vi.fn(),
  fetchScenario: vi.fn(),
  fetchScenarios: vi.fn(),
  sendScenarioChat: vi.fn(),
}));

import App from "../src/App.jsx";
import {
  computeOptimizedRoute,
  computeAlternateRoute,
  fetchReasoning,
  fetchScenarios,
  sendScenarioChat,
} from "../src/lib/api.js";

const baselineResponse = {
  scenario_id: "scenario-1",
  label: "Los Angeles -> Chicago",
  route: {
    route_id: "route-1",
    distance_m: 120000,
    duration_s: 7200,
    geometry: {
      type: "LineString",
      coordinates: [
        [-118.2437, 34.0522],
        [-87.6298, 41.8781],
      ],
    },
    risk_score: 41,
    cost_usd: 340,
  },
  live_disruptions: [
    {
      id: "incident-1",
      category: "weather_severe",
      type: "Severe weather",
      description: "Heavy storm along route",
      severity: "high",
      provider: "newsapi",
      location: { lat: 39.2, lon: -102.4 },
    },
  ],
  reasoning: "Baseline route reasoning",
};

const disruptionResponse = {
  scenario_id: "scenario-1",
  disruption: {
    type: "weather_severe",
    severity: "high",
    locations: [{ lat: 39.2, lon: -102.4 }],
    notes: ["Weather event"],
  },
  reroute: {
    route_id: "route-2",
    distance_m: 150000,
    duration_s: 14000,
    geometry: {
      type: "LineString",
      coordinates: [
        [-118.2437, 34.0522],
        [-102.4, 39.2],
        [-87.6298, 41.8781],
      ],
    },
    risk_score: 66,
    cost_usd: 430,
    multiplier_applied: 1.9,
  },
  reasoning: "Reroute reasoning",
};

describe("App", () => {
  beforeEach(() => {
    fetchScenarios.mockResolvedValue({ scenarios: [] });
    computeOptimizedRoute.mockResolvedValue(baselineResponse);
    computeAlternateRoute.mockResolvedValue(disruptionResponse);
    fetchReasoning.mockResolvedValue({ reasoning: "Refreshed route reasoning" });
    sendScenarioChat.mockResolvedValue({ reply: "Dispatch with caution." });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  test("compute route enables alternate route calculation", async () => {
    render(<App />);

    fireEvent.input(screen.getByTestId("source-lat-input"), { target: { value: "34.0522" } });
    fireEvent.input(screen.getByTestId("source-lon-input"), { target: { value: "-118.2437" } });
    fireEvent.input(screen.getByTestId("destination-lat-input"), { target: { value: "41.8781" } });
    fireEvent.input(screen.getByTestId("destination-lon-input"), { target: { value: "-87.6298" } });

    fireEvent.click(screen.getByTestId("compute-optimized-route-button"));

    await waitFor(() => {
      expect(computeOptimizedRoute).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByTestId("select-live-disruption-incident-1"));

    await waitFor(() => {
      expect(screen.getByTestId("compute-alternate-route-button")).not.toBeDisabled();
    });

    expect(screen.getByTestId("metric-distance-card")).toHaveTextContent("120.0 km");
  });

  test("shows validation error when coordinates are missing", async () => {
    render(<App />);

    fireEvent.click(screen.getByTestId("compute-optimized-route-button"));

    await waitFor(() => {
      expect(screen.getByTestId("error-toast")).toHaveTextContent("Coordinates must be valid numbers");
    });

    expect(computeOptimizedRoute).not.toHaveBeenCalled();
  });

  test("shows validation error when coordinates are out of range", async () => {
    render(<App />);

    fireEvent.input(screen.getByTestId("source-lat-input"), { target: { value: "134.0522" } });
    fireEvent.input(screen.getByTestId("source-lon-input"), { target: { value: "-118.2437" } });
    fireEvent.input(screen.getByTestId("destination-lat-input"), { target: { value: "41.8781" } });
    fireEvent.input(screen.getByTestId("destination-lon-input"), { target: { value: "-87.6298" } });

    fireEvent.click(screen.getByTestId("compute-optimized-route-button"));

    await waitFor(() => {
      expect(screen.getByTestId("error-toast")).toHaveTextContent(
        "Coordinates are out of range (lat: -90 to 90, lon: -180 to 180)"
      );
    });

    expect(computeOptimizedRoute).not.toHaveBeenCalled();
  });

  test("alternate route updates active disruption card", async () => {
    render(<App />);

    fireEvent.input(screen.getByTestId("source-lat-input"), { target: { value: "34.0522" } });
    fireEvent.input(screen.getByTestId("source-lon-input"), { target: { value: "-118.2437" } });
    fireEvent.input(screen.getByTestId("destination-lat-input"), { target: { value: "41.8781" } });
    fireEvent.input(screen.getByTestId("destination-lon-input"), { target: { value: "-87.6298" } });

    fireEvent.click(screen.getByTestId("compute-optimized-route-button"));
    await waitFor(() => expect(computeOptimizedRoute).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByTestId("select-live-disruption-incident-1"));
    fireEvent.click(screen.getByTestId("compute-alternate-route-button"));

    await waitFor(() => {
      expect(computeAlternateRoute).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByTestId("metric-active-disruption-card")).toHaveTextContent(
      "weather severe"
    );
  });

  test("chat sends grounded message", async () => {
    render(<App />);

    fireEvent.input(screen.getByTestId("source-lat-input"), { target: { value: "34.0522" } });
    fireEvent.input(screen.getByTestId("source-lon-input"), { target: { value: "-118.2437" } });
    fireEvent.input(screen.getByTestId("destination-lat-input"), { target: { value: "41.8781" } });
    fireEvent.input(screen.getByTestId("destination-lon-input"), { target: { value: "-87.6298" } });

    fireEvent.click(screen.getByTestId("compute-optimized-route-button"));
    await waitFor(() => expect(computeOptimizedRoute).toHaveBeenCalledTimes(1));

    fireEvent.input(screen.getByTestId("chat-input"), {
      target: { value: "What is the risk?" },
    });
    fireEvent.click(screen.getByTestId("chat-send-button"));

    await waitFor(() => {
      expect(sendScenarioChat).toHaveBeenCalledWith("scenario-1", "What is the risk?");
    });
  });

  test("refresh reasoning fetches latest explanation", async () => {
    render(<App />);

    fireEvent.input(screen.getByTestId("source-lat-input"), { target: { value: "34.0522" } });
    fireEvent.input(screen.getByTestId("source-lon-input"), { target: { value: "-118.2437" } });
    fireEvent.input(screen.getByTestId("destination-lat-input"), { target: { value: "41.8781" } });
    fireEvent.input(screen.getByTestId("destination-lon-input"), { target: { value: "-87.6298" } });

    fireEvent.click(screen.getByTestId("compute-optimized-route-button"));
    await waitFor(() => expect(computeOptimizedRoute).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByTestId("refresh-reasoning-button"));

    await waitFor(() => {
      expect(fetchReasoning).toHaveBeenCalledWith("scenario-1");
      expect(screen.getByTestId("reasoning-card")).toHaveTextContent("Refreshed route reasoning");
    });
  });

  test("playback slider changes step", async () => {
    render(<App />);

    fireEvent.input(screen.getByTestId("playback-slider"), {
      target: { value: "2" },
    });

    expect(screen.getByTestId("playback-step-label")).toHaveTextContent("Step 2");
  });
});
