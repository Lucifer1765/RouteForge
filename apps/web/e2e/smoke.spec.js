import { expect, test } from "@playwright/test";

test("compute to disruption to playback flow", async ({ page }) => {
  await page.route("**/api/scenarios", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ scenarios: [] }),
    });
  });

  await page.route("**/api/routes/compute", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        scenario_id: "scenario-e2e",
        label: "Los Angeles -> Chicago",
        route: {
          route_id: "route-e2e-a",
          distance_m: 110000,
          duration_s: 7000,
          risk_score: 38,
          cost_usd: 305,
          geometry: {
            type: "LineString",
            coordinates: [
              [-118.2437, 34.0522],
              [-87.6298, 41.8781],
            ],
          },
        },
        live_disruptions: [
          {
            id: "incident-e2e-1",
            category: "construction",
            type: "Road construction",
            description: "Major roadwork on I-80",
            severity: "high",
            provider: "tomtom",
            location: { lat: 39.8, lon: -96.5 },
          },
        ],
        reasoning: "Baseline route computed",
      }),
    });
  });

  await page.route("**/api/routes/disruption", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        scenario_id: "scenario-e2e",
        disruption: {
          type: "construction",
          severity: "high",
          locations: [{ lat: 39.8, lon: -96.5 }],
          notes: ["Major roadwork on I-80"],
        },
        reroute: {
          route_id: "route-e2e-b",
          distance_m: 145000,
          duration_s: 14800,
          risk_score: 73,
          cost_usd: 460,
          multiplier_applied: 2.1,
          geometry: {
            type: "LineString",
            coordinates: [
              [-118.2437, 34.0522],
              [-96.5, 39.8],
              [-87.6298, 41.8781],
            ],
          },
        },
        reasoning: "Cascading disruption triggered reroute",
      }),
    });
  });

  await page.route("**/api/chat", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ reply: "The cascade increases both transit time and risk." }),
    });
  });

  await page.goto("/");

  await expect(page.locator('[data-testid="compute-optimized-route-button"]')).toBeDisabled();

  await page.click('[data-testid="select-source-button"]');
  await page.locator('.leaflet-container').click({ position: { x: 190, y: 170 } });
  await page.click('[data-testid="select-destination-button"]');
  await page.locator('.leaflet-container').click({ position: { x: 460, y: 250 } });

  await page.fill('[data-testid="source-name-input"]', "Los Angeles Hub");
  await page.fill('[data-testid="destination-name-input"]', "Chicago Hub");

  await page.click('[data-testid="compute-optimized-route-button"]');
  await expect(page.locator('[data-testid="metric-distance-card"]')).toContainText("110.0 km");

  await page.click('[data-testid="disruption-multiselect-trigger"]');
  await page.click('[data-testid="select-live-disruption-incident-e2e-1"]');
  await page.click('[data-testid="disruption-multiselect-trigger"]');
  await page.click('[data-testid="compute-alternate-route-button"]');
  await expect(page.locator('[data-testid="metrics-panel"]')).toContainText("Disruption: construction");

  await page.fill('[data-testid="chat-input"]', "Can we still dispatch?");
  await page.click('[data-testid="chat-send-button"]');
  await expect(page.locator('[data-testid="chat-messages"]')).toContainText("cascade");

  await page.click('[data-testid="playback-play-pause-button"]');
  await page.waitForTimeout(1200);
  await expect(page.locator('[data-testid="playback-step-label"]')).toContainText("Step 1");
});
