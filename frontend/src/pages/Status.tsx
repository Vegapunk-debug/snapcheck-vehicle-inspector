import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getStatus, imageUrl, type StatusResponse } from "../api";
import { StatusBadge } from "../components/StatusBadge";

const POLL_INTERVAL_MS = 1_000;
const MAX_POLLING_SECONDS = 120;

export default function Status() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();

  const [statusData, setStatusData] = useState<StatusResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Poll /api/status/:id every second until done → redirect to results.
  useEffect(() => {
    if (!jobId) return;

    let isCancelled = false;
    let elapsedSeconds = 0;

    const pollStatus = async () => {
      try {
        const latestStatus = await getStatus(jobId);
        if (isCancelled) return;

        setStatusData(latestStatus);

        if (latestStatus.status === "completed" || latestStatus.status === "failed") {
          navigate(`/results/${jobId}`, { replace: true });
        }
      } catch (error) {
        if (!isCancelled) setErrorMessage((error as Error).message);
      }
    };

    pollStatus();
    const intervalId = setInterval(() => {
      elapsedSeconds += 1;
      if (elapsedSeconds > MAX_POLLING_SECONDS) return; // give up at 2 min
      pollStatus();
    }, POLL_INTERVAL_MS);

    return () => {
      isCancelled = true;
      clearInterval(intervalId);
    };
  }, [jobId, navigate]);

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

  if (!statusData) {
    return (
      <div className="layout single">
        <div className="card detail-card">
          <div className="empty-state">
            <div className="empty-title">Loading…</div>
          </div>
        </div>
      </div>
    );
  }

  const isPending = statusData.status === "pending";
  const isProcessing = statusData.status === "processing";

  return (
    <div className="layout single">
      <div className="card detail-card">
        <div className="detail-header">
          <div className="detail-title-block">
            <Link to="/" className="link">← back</Link>
            <div className="detail-filename">{statusData.filename}</div>
            <div className="detail-id">{statusData.jobId}</div>
          </div>
          <StatusBadge status={statusData.status} />
        </div>

        <div className="status-page">
          <div className="status-preview">
            <img
              src={imageUrl(statusData.jobId)}
              alt=""
              onError={(event) => ((event.currentTarget.style.display = "none"))}
            />
          </div>

          <div className="status-body">
            <div className="status-spinner">
              <div className={`spinner ${isProcessing ? "" : "pending-spinner"}`} aria-hidden />
            </div>

            <h2 className="status-headline">
              {isPending ? "Queued for analysis" : "Analyzing image"}
            </h2>

            <p className="status-sub">
              {isPending
                ? "Your image is waiting in the queue. A worker will pick it up momentarily."
                : "Running 6 checks in parallel — blur, brightness, duplicate, OCR, dimensions, screenshot."}
            </p>

            <div className="timeline-vertical">
              <div className="tlv-step done">
                <div className="tlv-dot" />
                <div>
                  <div className="tlv-label">Uploaded</div>
                  <div className="tlv-time">{new Date(statusData.createdAt).toLocaleTimeString()}</div>
                </div>
              </div>

              <div
                className={`tlv-step ${statusData.startedAt ? "done" : ""} ${isProcessing ? "active" : ""}`}
              >
                <div className="tlv-dot" />
                <div>
                  <div className="tlv-label">Started</div>
                  <div className="tlv-time">
                    {statusData.startedAt ? new Date(statusData.startedAt).toLocaleTimeString() : "—"}
                  </div>
                </div>
              </div>

              <div className={`tlv-step ${statusData.completedAt ? "done" : ""}`}>
                <div className="tlv-dot" />
                <div>
                  <div className="tlv-label">Completed</div>
                  <div className="tlv-time">
                    {statusData.completedAt ? new Date(statusData.completedAt).toLocaleTimeString() : "—"}
                  </div>
                </div>
              </div>
            </div>

            <div className="status-meta">
              <span>Attempts: <strong>{statusData.attempts}</strong></span>
          </div>
        </div>

        <div className="detail-section detail-cta">
          <Link to="/" className="btn">Upload another →</Link>
        </div>
      </div>
    </div>
  );
}
