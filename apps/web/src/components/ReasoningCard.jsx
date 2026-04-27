import { useEffect, useState } from "preact/hooks";

export default function ReasoningCard({ reasoning, onRefresh, canRefresh, isRefreshing }) {
  const summary =
    reasoning ||
    "Compute a route and select disruptions to generate a scenario-aware operational summary.";
  const isLongSummary = summary.length > 140;
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    setIsExpanded(false);
  }, [summary]);

  return (
    <section className="reasoning-card" data-testid="reasoning-card">
      <div className="section-header">
        <div className="section-icon amber">
          <span className="lucide" data-lucide="lightbulb" style={{ width: 16, height: 16 }} />
        </div>
        <span className="section-title">AI Summary</span>
        <button
          type="button"
          className="btn btn-subtle btn-sm"
          onClick={onRefresh}
          disabled={!canRefresh || isRefreshing}
          data-testid="refresh-reasoning-button"
        >
          {isRefreshing ? "Refreshing..." : "Refresh reasoning"}
        </button>
      </div>
      <p className={`reasoning-copy ${isExpanded ? "expanded" : "collapsed"}`}>
        {summary}
      </p>
      {isLongSummary ? (
        <button
          type="button"
          className="reasoning-expand-button"
          onClick={() => setIsExpanded((current) => !current)}
          data-testid="reasoning-expand-button"
        >
          {isExpanded ? "Show less" : "...click to view more"}
        </button>
      ) : null}
    </section>
  );
}
