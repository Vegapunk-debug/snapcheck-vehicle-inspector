// Express HTTP server. All seven routes live here so the flow is easy
// to follow top-to-bottom. The worker starts in the same Node process
// — see worker.ts.

import express, { type Request, type Response } from "express";
import cors from "cors";
import multer from "multer";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { v4 as uuid } from "uuid";
import "dotenv/config";

import * as db from "./db";
import { enqueue } from "./queue";
import { startWorker } from "./worker";

// --- config ---------------------------------------------------------

const PORT = Number(process.env.PORT ?? 3000);
const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR ?? "./uploads");
const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

// --- helpers --------------------------------------------------------

// Match the canonical v4 UUID pattern so callers can't probe arbitrary strings.
function isValidUUID(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

// --- app setup ------------------------------------------------------

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_SIZE_BYTES },
});

app.use(cors());

// --- routes ---------------------------------------------------------

// Liveness probe — confirms API + DB are reachable.
app.get("/health", async (_req, res) => {
  try {
    await db.ping();
    res.json({ status: "ok", checks: { api: "ok", db: "ok" } });
  } catch {
    res.status(503).json({ status: "down", checks: { api: "ok", db: "down" } });
  }
});

// Accept an image upload and queue it for analysis.
app.post("/api/upload", upload.single("image"), async (req: Request, res: Response) => {
  try {
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: "no file uploaded (field: image)" });
    }
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return res.status(400).json({ error: `mime not supported: ${file.mimetype}` });
    }

    const imageId = uuid();
    const sha256Hash = crypto.createHash("sha256").update(file.buffer).digest("hex");
    const extension = file.originalname.match(/\.[a-z0-9]+$/i)?.[0] ?? ".bin";
    const storedPath = path.join(UPLOAD_DIR, `${imageId}${extension}`);

    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    await fs.writeFile(storedPath, file.buffer);

    await db.createImage({
      id: imageId,
      filename: file.originalname,
      storedPath,
      mimetype: file.mimetype,
      sizeBytes: file.size,
      sha256: sha256Hash,
    });

    enqueue(imageId);

    res.status(202).json({
      jobId: imageId,
      status: "pending",
      message: "Upload accepted",
    });
  } catch (error) {
    console.error("[upload] error:", error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// Current status of a job.
app.get("/api/status/:id", async (req, res) => {
  if (!isValidUUID(req.params.id)) {
    return res.status(400).json({ error: "invalid id format" });
  }

  const image = await db.findImage(req.params.id);
  if (!image) return res.status(404).json({ error: "not found" });

  res.json({
    jobId: image.id,
    status: image.status,
    filename: image.filename,
    attempts: image.attempts,
    failureReason: image.failureReason,
    createdAt: image.createdAt.toISOString(),
    startedAt: image.startedAt?.toISOString() ?? null,
    completedAt: image.completedAt?.toISOString() ?? null,
    updatedAt: (image.completedAt ?? image.startedAt ?? image.createdAt).toISOString(),
  });
});

// Full results once a job has finished. Returns 409 while still in progress.
app.get("/api/results/:id", async (req, res) => {
  if (!isValidUUID(req.params.id)) {
    return res.status(400).json({ error: "invalid id format" });
  }

  const image = await db.findImage(req.params.id);
  if (!image) return res.status(404).json({ error: "not found" });

  if (image.status === "pending" || image.status === "processing") {
    return res.status(409).json({
      jobId: image.id,
      status: image.status,
      message: "Results not ready",
    });
  }

  res.json({
    jobId: image.id,
    status: image.status,
    filename: image.filename,
    completedAt: image.completedAt?.toISOString(),
    reason: image.failureReason ?? undefined,
    results: await db.getResults(image.id),
  });
});

// Stream the original uploaded bytes — used by the frontend preview.
app.get("/api/image/:id", async (req, res) => {
  if (!isValidUUID(req.params.id)) {
    return res.status(400).json({ error: "invalid id format" });
  }

  const image = await db.findImage(req.params.id);
  if (!image) return res.status(404).json({ error: "not found" });

  try {
    const buffer = await fs.readFile(image.storedPath);
    res.setHeader("Content-Type", image.mimetype ?? "application/octet-stream");
    res.send(buffer);
  } catch {
    res.status(410).json({ error: "file gone" });
  }
});

// List recent jobs, optionally filtered by status.
app.get("/api/jobs", async (req, res) => {
  try {
    const statusFilter = (req.query.status as string) || null;
    const limit = Math.min(200, Number(req.query.limit ?? 50));

    const rows = await db.listImages(statusFilter, limit);

    res.json({
      count: rows.length,
      items: rows.map((image) => ({
        jobId: image.id,
        filename: image.filename,
        status: image.status,
        mimetype: image.mimetype,
        sizeBytes: image.sizeBytes,
        createdAt: image.createdAt.toISOString(),
        completedAt: image.completedAt?.toISOString() ?? null,
      })),
    });
  } catch (error) {
    console.error("[jobs] error:", error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// Counts of jobs by status — feeds the dashboard tiles.
app.get("/api/stats", async (_req, res) => {
  try {
    res.json(await db.countByStatus());
  } catch (error) {
    console.error("[stats] error:", error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// --- start ----------------------------------------------------------

app.listen(PORT, () => {
  startWorker();
  console.log(`[server] listening on http://localhost:${PORT}`);
});
