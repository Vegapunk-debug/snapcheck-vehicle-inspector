import { useState } from "react";
import type { CheckRow } from "../api";

// Display name per backend check id.
const CHECK_DISPLAY_NAMES: Record<string, string> = {
  blur_detection: "Full-Image Blur",
  brightness_analysis: "Brightness",
  duplicate_detection: "Duplicate",
  ocr_plate_check: "Plate (OCR)",
  dimension_validation: "Dimensions",
  screenshot_detection: "Screenshot",
  tamper_detection: "Tampering",
};

type Outcome = "pass" | "fail";

// Icons for the circular pass/fail badge.
const OUTCOME_ICONS: Record<Outcome, JSX.Element> = {
  pass: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  fail: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
};

export function CheckCard({ check }: { check: CheckRow }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const outcome: Outcome = check.passed ? "pass" : "fail";
  const confidencePercent = Math.round(check.confidence * 100);
  const displayName = CHECK_DISPLAY_NAMES[check.check] ?? check.check;
  const barColor = outcome === "pass" ? "var(--green)" : "var(--red)";

  return (
    <div className={`check ${isExpanded ? "open" : ""}`}>
      <button
        type="button"
        className="check-head"
        onClick={() => setIsExpanded((wasExpanded) => !wasExpanded)}
      >
        <div className={`check-icon ${outcome}`}>{OUTCOME_ICONS[outcome]}</div>

        <div className="check-name">
          <span>{displayName}</span>
          <span className="check-issue">{check.check}</span>
        </div>

        <div className="check-confidence">
          <div className="confidence-bar" aria-hidden>
            <span style={{ width: `${confidencePercent}%`, background: barColor }} />
          </div>
          <div className="confidence-num">{confidencePercent}%</div>
        </div>

        <svg
          className="check-toggle"
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      <div className="check-body">
        <p className="check-details">{check.details}</p>
      </div>
    </div>
  );
}
