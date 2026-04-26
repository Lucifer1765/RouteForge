export default function ReasoningCard({ reasoning }) {
  return (
    <section className="reasoning-card" data-testid="reasoning-card">
      <div className="section-header">
        <div className="section-icon amber">
          <span className="lucide" data-lucide="lightbulb" style={{ width: 16, height: 16 }} />
        </div>
        <span className="section-title">AI Reasoning</span>
      </div>
      <p className="reasoning-copy">
        {reasoning || "Compute a route and select live disruptions to see alternate-route reasoning."}
      </p>
    </section>
  );
}
