import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getResults, getStatus, imageUrl, type ResultsResponse, type StatusResponse } from "../api";
import { StatusBadge } from "../components/StatusBadge";
import { ScoreGauge } from "../components/ScoreGauge";
import { CheckCard } from "../components/CheckCard";
import { IssueChip } from "../components/IssueChip";

// Weight each check carries in the final score.
const CHECK_WEIGHTS: Record<string, number> = {
  blur_detection: 1.5,
  brightness_analysis: 1.0,
  duplicate_detection: 2.0,
  ocr_plate_check: 1.5,
  dimension_validation: 1.5,
  screenshot_detection: 1.0,
};

// Display labels for issue chips.
const ISSUE_LABELS: Record<string, string> = {
  blur_detection: "blurry image",
  brightness_analysis: "low light",
  duplicate_detection: "duplicate image",
  ocr_plate_check: "invalid or missing plate",
  dimension_validation: "image too small",
  screenshot_detection: "possible screenshot",
};

const COPY_FLASH_MS = 1_200;

export default function Results() {
  const { jobId } = useParams<{ jobId: string }>();

  const [results, setResults] = useState<ResultsResponse | null>(null);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) return;
    Promise.all([getResults(jobId), getStatus(jobId)])
      .then(([resultsResponse, statusResponse]) => {
        setResults(resultsResponse);
        setStatus(statusResponse);
      })
      .catch((error) => setErrorMessage((error as Error).message));
  }, [jobId]);

  // Weighted 0..1 score. Passed → confidence. Failed → 1 - confidence.
  const weightedScore = useMemo(() => {
    if (!results || !results.results.length) return null;

    let weightedSum = 0;
    let totalWeight = 0;

    for (const checkResult of results.results) {
      const weight = CHECK_WEIGHTS[checkResult.check] ?? 1;
      const score = checkResult.passed ? checkResult.confidence : 1 - checkResult.confidence;
      weightedSum += weight * score;
      totalWeight += weight;
    }

    return totalWeight ? weightedSum / totalWeight : null;
  }, [results]);

  // Label list for failed checks.
  const issueLabels = useMemo(() => {
    if (!results) return [] as string[];
    return results.results
      .filter((checkResult) => !checkResult.passed)
      .map((checkResult) => ISSUE_LABELS[checkResult.check] ?? checkResult.check);
  }, [results]);

  if (errorMessage) {
    return (
      <div className="layout single">
        <div className="card detail-card">
          <div className="empty-state">
            <div className="empty-title">{errorMessage}</div>
            <Link to="/" className="link">← back</Link>
          </div>
        </div>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="layout single">
        <div className="card detail-card">
          <div className="empty-state"><div className="empty-title">Loading…</div></div>
        </div>
      </div>
    );
  }

  const isFailed = status.status === "failed";

  return (
    <div className="layout single">
      <div className="card detail-card detail-body">
        <div className="detail-header">
          <div className="detail-title-block">
            <Link to="/" className="link">← back</Link>
            <div className="detail-filename">{status.filename}</div>
            <div className="detail-id">{status.jobId}</div>
          </div>
          <div className="detail-actions">
            <CopyJobIdButton value={status.jobId} />
            <StatusBadge status={status.status} />
          </div>
        </div>

        <div className="detail-hero">
          <div className="preview-wrap">
            <img
              src={imageUrl(status.jobId)}
              alt=""
              onError={(event) =>
                (event.currentTarget.parentElement!.innerHTML =
                  "<div class='preview-loading'>(no preview)</div>")
              }
            />
          </div>
          <div className="score-block">
            {isFailed ? (
              <div className="failed-block">
                <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
                <div className="failed-headline">Processing failed</div>
                <div className="failed-reason">{results?.reason ?? "unknown error"}</div>
                <div className="status-meta">Attempts: {status.attempts}</div>
              </div>
            ) : (
              <>
                <ScoreGauge score={weightedScore} weights={CHECK_WEIGHTS} />
                <div className="meta-row">
                  <span>Completed:</span>
                  <strong>
                    {status.completedAt ? new Date(status.completedAt).toLocaleString() : "—"}
                  </strong>
                </div>
              </>
            )}
          </div>
        </div>

        {!isFailed && (
          <div className="detail-section">
            <div className="detail-section-title">Issues detected</div>
            {issueLabels.length ? (
              <div className="issues">
                {issueLabels.map((label) => <IssueChip key={label} text={label} />)}
              </div>
            ) : (
              <div className="no-issues">no issues detected — image looks good</div>
            )}
          </div>
        )}

        {results && results.results.length > 0 && (
          <div className="detail-section">
            <div className="detail-section-title">Checks ({results.results.length})</div>
            <div className="checks">
              {results.results.map((checkResult) => (
                <CheckCard key={checkResult.check} check={checkResult} />
              ))}
            </div>
          </div>
        )}

        <div className="detail-section">
          <div className="detail-section-title">Metadata</div>
          <dl className="meta-grid">
            <dt>job id</dt><dd className="mono">{status.jobId}</dd>
            <dt>uploaded</dt><dd>{new Date(status.createdAt).toLocaleString()}</dd>
            {status.startedAt && (<><dt>started</dt><dd>{new Date(status.startedAt).toLocaleString()}</dd></>)}
            {status.completedAt && (<><dt>completed</dt><dd>{new Date(status.completedAt).toLocaleString()}</dd></>)}
            <dt>attempts</dt><dd>{status.attempts}</dd>
          </dl>
        </div>
      </div>
    </div>
  );
}

function CopyJobIdButton({ value }: { value: string }) {
  const [justCopied, setJustCopied] = useState(false);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(value).then(() => {
      setJustCopied(true);
      setTimeout(() => setJustCopied(false), COPY_FLASH_MS);
    });
  };

  return (
    <button type="button" className="copy-btn" onClick={copyToClipboard}>
      {justCopied ? "copied" : "copy id"}
    </button>
  );
}
