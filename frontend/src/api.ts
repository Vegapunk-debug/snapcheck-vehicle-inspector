// Typed API client. Paths are relative — proxied to backend by Vite in dev.

const API_BASE = import.meta.env.VITE_API_URL || "";

export type JobStatus = "pending" | "processing" | "completed" | "failed";

export interface UploadResponse {
  jobId: string;
  status: JobStatus;
  message: string;
  idempotent?: boolean;
}

export interface StatusResponse {
  jobId: string;
  status: JobStatus;
  filename: string;
  attempts: number;
  failureReason: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
}

export interface CheckRow {
  check: string;
  passed: boolean;
  confidence: number;
  details: string;
}

export interface ResultsResponse {
  jobId: string;
  status: JobStatus;
  filename: string;
  completedAt?: string;
  reason?: string;
  results: CheckRow[];
}

export interface JobListItem {
  jobId: string;
  filename: string;
  status: JobStatus;
  mimetype: string | null;
  sizeBytes: number | null;
  createdAt: string;
  completedAt: string | null;
}

export interface JobsResponse {
  count: number;
  items: JobListItem[];
}

export interface StatsResponse {
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body?.message || body?.error || res.statusText);
    (err as Error & { status?: number; body?: unknown }).status = res.status;
    (err as Error & { status?: number; body?: unknown }).body = body;
    throw err;
  }
  return body as T;
}

export async function uploadImage(file: File): Promise<UploadResponse> {
  const form = new FormData();
  form.append("image", file);
  const res = await fetch(`${API_BASE}/api/upload`, { method: "POST", body: form });
  return jsonOrThrow<UploadResponse>(res);
}

export async function getStatus(jobId: string): Promise<StatusResponse> {
  const res = await fetch(`${API_BASE}/api/status/${jobId}`);
  return jsonOrThrow<StatusResponse>(res);
}

export async function getResults(jobId: string): Promise<ResultsResponse | null> {
  const res = await fetch(`${API_BASE}/api/results/${jobId}`);
  if (res.status === 409) return null; // not ready yet
  return jsonOrThrow<ResultsResponse>(res);
}

export async function listJobs(opts: { status?: JobStatus; limit?: number } = {}): Promise<JobsResponse> {
  const params = new URLSearchParams();
  if (opts.status) params.set("status", opts.status);
  if (opts.limit) params.set("limit", String(opts.limit));
  const qs = params.toString();
  const res = await fetch(`${API_BASE}/api/jobs${qs ? `?${qs}` : ""}`);
  return jsonOrThrow<JobsResponse>(res);
}

export async function getStats(): Promise<StatsResponse> {
  const res = await fetch(`${API_BASE}/api/stats`);
  return jsonOrThrow<StatsResponse>(res);
}

export async function getHealth(): Promise<{ status: string; checks: Record<string, string> }> {
  const res = await fetch(`${API_BASE}/health`);
  return res.json();
}

export function imageUrl(jobId: string): string {
  return `${API_BASE}/api/image/${jobId}`;
}
