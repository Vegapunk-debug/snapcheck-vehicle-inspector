type Props = {
  score: number | null;
  label?: string;
  size?: number;
  // Per-check weights for tooltip breakdown.
  weights?: Record<string, number>;
};

// SVG arc geometry — radius 50 in a 120-unit viewBox.
const ARC_RADIUS = 50;
const ARC_CIRCUMFERENCE = 2 * Math.PI * ARC_RADIUS;

// Traffic-light thresholds.
const GREEN_MIN = 0.7;
const YELLOW_MIN = 0.45;

export function ScoreGauge({
  score,
  label = "quality score",
  size = 160,
  weights,
}: Props) {
  const tooltipText = buildTooltipText(weights);

  // No data yet → track only.
  if (score === null || score === undefined) {
    return (
      <div className="gauge" style={{ width: size, height: size }} title={tooltipText}>
        <svg viewBox="0 0 120 120">
          <circle className="gauge-track" cx="60" cy="60" r={ARC_RADIUS} strokeWidth="10" fill="none" />
        </svg>
        <div className="gauge-text">
          <div className="gauge-num" style={{ fontSize: 18, color: "var(--text-faint)" }}>…</div>
          <div className="gauge-label">{label}</div>
        </div>
      </div>
    );
  }

  // Clamp 0..1 → SVG dash offset.
  const clampedScore = Math.max(0, Math.min(1, score));
  const dashOffset = ARC_CIRCUMFERENCE * (1 - clampedScore);
  const arcColor =
    clampedScore >= GREEN_MIN ? "var(--green)" :
    clampedScore >= YELLOW_MIN ? "var(--yellow)" :
    "var(--red)";

  return (
    <div className="gauge" style={{ width: size, height: size }} title={tooltipText}>
      <svg viewBox="0 0 120 120">
        <circle className="gauge-track" cx="60" cy="60" r={ARC_RADIUS} strokeWidth="10" fill="none" />
        <circle
          className="gauge-fill"
          cx="60"
          cy="60"
          r={ARC_RADIUS}
          strokeWidth="10"
          fill="none"
          stroke={arcColor}
          strokeDasharray={ARC_CIRCUMFERENCE}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
        />
      </svg>
      <div className="gauge-text">
        <div className="gauge-num">{Math.round(clampedScore * 100)}</div>
        <div className="gauge-label">{label}</div>
      </div>
    </div>
  );
}

// Build native `title` tooltip text — formula + per-check weights.
function buildTooltipText(weights?: Record<string, number>): string {
  const formula = "Weighted across checks: pass × confidence ÷ total weight.";
  if (!weights) return formula;

  const weightLines = Object.entries(weights)
    .sort(([, leftWeight], [, rightWeight]) => rightWeight - leftWeight)
    .map(([checkName, weight]) => `${checkName}: ×${weight}`);

  return `${formula}\n\n${weightLines.join("\n")}`;
}
