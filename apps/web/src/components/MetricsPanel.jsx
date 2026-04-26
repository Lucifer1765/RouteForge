function formatDistance(distanceM) {
  if (!Number.isFinite(distanceM)) {
    return "—";
  }
  return (distanceM / 1000).toFixed(1);
}

function formatDuration(durationS) {
  if (!Number.isFinite(durationS)) {
    return "—";
  }

  const totalMinutes = Math.round(durationS / 60);
  const totalHours = Math.floor(totalMinutes / 60);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const minutes = totalMinutes % 60;

  const parts = [];
  if (days > 0) {
    parts.push(`${days}d`);
  }
  if (hours > 0) {
    parts.push(`${hours}h`);
  }
  if (minutes > 0 || parts.length === 0) {
    parts.push(`${minutes}m`);
  }

  return parts.join(" ");
}

function formatDurationDelta(currentS, baselineS) {
  if (!Number.isFinite(currentS) || !Number.isFinite(baselineS)) {
    return null;
  }
  const delta = currentS - baselineS;
  const formatted = formatDuration(Math.abs(delta));
  const sign = delta >= 0 ? "+" : "−";
  return `${sign}${formatted}`;
}

function formatDelta(current, baseline, suffix = "") {
  if (!Number.isFinite(current) || !Number.isFinite(baseline)) {
    return null;
  }

  const delta = current - baseline;
  const sign = delta >= 0 ? "+" : "−";
  const absolute = Math.abs(delta);
  return `${sign}${absolute.toFixed(1)}${suffix}`;
}

function MetricCard({ title, value, baseline, delta, testId, suffix = "", icon, iconColor = "teal" }) {
  const deltaClass = delta ? (delta.startsWith("+") ? "negative" : "positive") : "";

  return (
    <div className="metric-card metric-stat-card" data-testid={testId}>
      <div className={`metric-icon ${iconColor}`}>
        <span className="lucide" data-lucide={icon} style={{ width: 16, height: 16 }} />
      </div>
      <div className="metric-title">{title}</div>
      <div className="metric-value mono metric-value-animated">
        {value}{suffix}
      </div>
      {baseline ? <div className="metric-baseline">was {baseline}{suffix}</div> : null}
      {delta ? <div className={`metric-delta ${deltaClass}`}>{delta}</div> : null}
    </div>
  );
}

function calculateDurationSeconds(distanceM, speedKmh) {
  if (!Number.isFinite(distanceM) || !Number.isFinite(speedKmh) || speedKmh <= 0) {
    return NaN;
  }
  return (distanceM / 1000 / speedKmh) * 3600;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function SpeedGauge({ speedKmh, min = 20, max = 120 }) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const normalized = clamp((speedKmh - min) / (max - min), 0, 1);
  const strokeLength = normalized * circumference;

  return (
    <div className="speed-gauge" data-testid="dynamic-speed-gauge">
      <svg viewBox="0 0 140 140" className="speed-gauge-svg">
        <circle className="speed-gauge-track" cx="70" cy="70" r={radius} />
        <circle
          className="speed-gauge-progress"
          cx="70"
          cy="70"
          r={radius}
          strokeDasharray={`${strokeLength} ${circumference}`}
        />
      </svg>
      <div className="speed-gauge-center">
        <div className="speed-gauge-value mono">{speedKmh}</div>
        <div className="speed-gauge-unit">km/h</div>
      </div>
    </div>
  );
}

export default function MetricsPanel({
  baselineMetrics,
  rerouteMetrics,
  activeDisruption,
  vehicleSpeed,
  onVehicleSpeedChange,
}) {
  const currentMetrics = rerouteMetrics || baselineMetrics;
  const hasReroute = Boolean(rerouteMetrics && baselineMetrics);
  const projectedDurationS = calculateDurationSeconds(currentMetrics?.distance_m, vehicleSpeed);
  const baselineProjectedDurationS = hasReroute
    ? calculateDurationSeconds(baselineMetrics?.distance_m, vehicleSpeed)
    : null;
  const riskDelta = hasReroute
    ? formatDelta(currentMetrics?.risk_score, baselineMetrics?.risk_score)
    : null;
  const disruptionLabel = activeDisruption?.type
    ? activeDisruption.type.replace(/_/g, " ")
    : "none";

  return (
    <section className="metrics-panel" data-testid="metrics-panel">
      <div className="section-header">
        <div className="section-icon">
          <span className="lucide" data-lucide="bar-chart-3" style={{ width: 16, height: 16 }} />
        </div>
        <span className="section-title">Route Metrics</span>
        <span className="metrics-disruption-chip">Disruption: {disruptionLabel}</span>
      </div>

      <div className="metrics-grid" data-testid="metrics-grid">
        <MetricCard
          title="Distance"
          value={formatDistance(currentMetrics?.distance_m)}
          baseline={hasReroute ? formatDistance(baselineMetrics.distance_m) : null}
          delta={
            hasReroute
              ? formatDelta(currentMetrics.distance_m / 1000, baselineMetrics.distance_m / 1000, " km")
              : null
          }
          suffix=" km"
          icon="route"
          iconColor="teal"
          testId="metric-distance-card"
        />

        <MetricCard
          title="Duration"
          value={formatDuration(currentMetrics?.duration_s)}
          baseline={hasReroute ? formatDuration(baselineMetrics?.duration_s) : null}
          delta={hasReroute ? formatDurationDelta(currentMetrics?.duration_s, baselineMetrics?.duration_s) : null}
          icon="clock"
          iconColor="amber"
          testId="metric-time-card"
        />

        <MetricCard
          title="Risk Score"
          value={Number.isFinite(currentMetrics?.risk_score) ? String(currentMetrics.risk_score) : "—"}
          baseline={hasReroute && Number.isFinite(baselineMetrics?.risk_score) ? String(baselineMetrics.risk_score) : null}
          delta={riskDelta}
          suffix="/100"
          icon="shield-alert"
          iconColor="rose"
          testId="metric-risk-card"
        />
      </div>

      <div className="metric-card speed-gauge-card" data-testid="metric-speed-card">
        <div className="speed-gauge-layout">
          <SpeedGauge speedKmh={vehicleSpeed} />
          <div className="speed-gauge-copy">
            <div className="metric-title">Dynamic Speed Gauge</div>
            <div className="metric-value mono metric-value-animated">{vehicleSpeed} km/h</div>
            <div className="metric-baseline">
              Projected ETA: {formatDuration(projectedDurationS)}
              {hasReroute ? ` (${formatDurationDelta(projectedDurationS, baselineProjectedDurationS) || "n/a"})` : ""}
            </div>
          </div>
        </div>
        <input
          type="range"
          min="20"
          max="120"
          step="5"
          value={vehicleSpeed ?? 80}
          onInput={(event) => onVehicleSpeedChange(Number(event.currentTarget.value))}
          className="speed-slider"
          data-testid="speed-slider"
        />
      </div>
    </section>
  );
}

