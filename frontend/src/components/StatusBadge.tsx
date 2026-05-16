import type { JobStatus } from "../api";

export function StatusBadge({ status }: { status: JobStatus }) {
  return (
    <span className={`status-badge s-${status}`}>{status}</span>
  );
}
