import { Link } from "react-router-dom";
import type { JobListItem } from "../api";
import { imageUrl } from "../api";
import { StatusBadge } from "./StatusBadge";

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return `${Math.max(0, Math.floor(diff))}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
}

type Props = {
  items: JobListItem[];
  activeId?: string;
  loading?: boolean;
};

export function JobList({ items, activeId, loading }: Props) {
  if (loading) {
    return (
      <div className="history">
        {[0, 1, 2].map((i) => (
          <div key={i} className="job-row is-skeleton" aria-hidden>
            <div className="job-thumb skeleton" />
            <div className="job-meta">
              <div className="skeleton skeleton-line" style={{ width: "65%" }} />
              <div className="skeleton skeleton-line" style={{ width: "35%", marginTop: 6 }} />
            </div>
            <div className="skeleton" style={{ width: 70, height: 18, borderRadius: 999 }} />
          </div>
        ))}
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="history-empty">
        <div className="empty-title">No jobs yet</div>
        <div className="empty-sub">Drop an image above to get started ↑</div>
      </div>
    );
  }

  return (
    <div className="history">
      {items.map((j) => {
        const link =
          j.status === "completed" || j.status === "failed"
            ? `/results/${j.jobId}`
            : `/status/${j.jobId}`;
        return (
          <Link
            to={link}
            key={j.jobId}
            className={`job-row ${activeId === j.jobId ? "is-active" : ""}`}
          >
            <div className="job-thumb">
              <img src={imageUrl(j.jobId)} alt="" onError={(e) => ((e.currentTarget.style.display = "none"))} />
            </div>
            <div className="job-meta">
              <div className="job-name">{j.filename}</div>
              <div className="job-when">{timeAgo(j.createdAt)}</div>
            </div>
            <StatusBadge status={j.status} />
          </Link>
        );
      })}
    </div>
  );
}
