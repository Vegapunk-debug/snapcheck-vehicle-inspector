import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  listJobs,
  uploadImage,
  getStats,
  type JobListItem,
  type JobStatus,
  type StatsResponse,
} from "../api";
import { Dropzone } from "../components/Dropzone";
import { JobList } from "../components/JobList";
import { StatsBar } from "../components/StatsBar";
import { Toasts, toast } from "../components/Toasts";

type StatusFilter = JobStatus | "";

const FILTER_OPTIONS: { key: StatusFilter; label: string }[] = [
  { key: "", label: "all" },
  { key: "pending", label: "pending" },
  { key: "processing", label: "processing" },
  { key: "completed", label: "done" },
  { key: "failed", label: "failed" },
];

const REFRESH_INTERVAL_MS = 3_000;
const JOB_LIST_LIMIT = 50;

export default function Upload() {
  const navigate = useNavigate();

  const [jobs, setJobs] = useState<JobListItem[]>([]);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");
  const [isUploading, setIsUploading] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  // Refetch jobs + stats. Re-made on filter change → interval restarts.
  const refreshJobsAndStats = useMemo(
    () => async () => {
      try {
        const [jobsResponse, statsResponse] = await Promise.all([
          listJobs({ status: statusFilter || undefined, limit: JOB_LIST_LIMIT }),
          getStats(),
        ]);
        setJobs(jobsResponse.items);
        setStats(statsResponse);
      } catch {
        // Network blip — keep last good values.
      } finally {
        setHasLoadedOnce(true);
      }
    },
    [statusFilter],
  );

  // Fetch once, then poll for live list.
  useEffect(() => {
    refreshJobsAndStats();
    const intervalId = setInterval(refreshJobsAndStats, REFRESH_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [refreshJobsAndStats]);

  // Fires on drop / paste / file-pick from Dropzone.
  const handleUpload = async (files: File[]) => {
    setIsUploading(true);
    let firstJobId: string | null = null;

    for (const file of files) {
      try {
        const uploadResult = await uploadImage(file);
        if (!firstJobId) firstJobId = uploadResult.jobId;

        toast({
          kind: "success",
          title: uploadResult.idempotent ? "Already uploaded" : "Queued for analysis",
          body: file.name,
        });
      } catch (error) {
        toast({
          kind: "error",
          title: "Upload failed",
          body: `${file.name} — ${(error as Error).message}`,
        });
      }
    }

    setIsUploading(false);
    refreshJobsAndStats();

    // Single-file upload → jump to status page.
    if (firstJobId && files.length === 1) {
      navigate(`/status/${firstJobId}`);
    }
  };

  return (
    <div className="layout">
      <section className="col col-left">
        <div className="card">
          <h2 className="card-title">Upload images</h2>
          <p className="card-sub">JPEG / PNG / WebP · up to 10 MB · drop, click, or paste</p>
          <Dropzone onFiles={handleUpload} />
          {isUploading ? <div className="busy-note">Uploading…</div> : null}
        </div>

        <div className="card">
          <h2 className="card-title">Pipeline stats</h2>
          <StatsBar stats={stats} />
        </div>
      </section>

      <section className="col col-right">
        <div className="card history-card">
          <div className="history-head">
            <h2 className="card-title">Recent jobs</h2>
            <div className="filter-pills">
              {FILTER_OPTIONS.map((option) => (
                <button
                  key={option.key || "all"}
                  type="button"
                  className={`pill ${statusFilter === option.key ? "pill-active" : ""}`}
                  onClick={() => setStatusFilter(option.key)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <JobList items={jobs} loading={!hasLoadedOnce} />
        </div>
      </section>

      <Toasts />
    </div>
  );
}
