# snapcheck

Async image inspection pipeline. Upload a vehicle image — get back seven structured checks (blur, brightness, duplicate, plate, screenshot, dimensions, tampering) processed through an in-memory queue.

Built as a take-home for Ginger Media Group.

---

## Table of Contents

- [Stack](#stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [API Reference](#api-reference)
- [Architecture](#architecture)
- [Image Analysis Checks](#image-analysis-checks)
- [Database Schema](#database-schema)
- [Trade-offs](#trade-offs)
- [AI Usage Disclosure](#ai-usage-disclosure)

---

## Stack

| Layer            | Choice                                            |
| ---------------- | ------------------------------------------------- |
| Frontend         | React 18 + Vite + react-router-dom + TypeScript   |
| Backend          | Node 20 + Express + TypeScript                    |
| Database         | PostgreSQL on Neon via Prisma v6                  |
| Queue            | In-memory (Node `EventEmitter` + array)           |
| Image processing | Sharp                                             |
| File uploads     | Multer (memory storage)                           |
| IDs              | uuid v4                                           |

No Redis, no Postgres, no Docker, no Tesseract.

---

## Project Structure

```
snapcheck/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma           # Image + AnalysisResult models
│   │   └── migrations/             # tracked SQL migrations
│   ├── src/
│   │   ├── db.ts                   # PrismaClient + every query helper
│   │   ├── queue.ts                # EventEmitter-backed in-memory queue
│   │   ├── worker.ts               # listens for "job:added", runs 7 checks
│   │   ├── server.ts               # express app + all 7 routes
│   │   └── checks/
│   │       ├── blur.ts             # Sharp stdev
│   │       ├── brightness.ts       # Sharp mean
│   │       ├── duplicate.ts        # sha256 DB lookup
│   │       ├── plate.ts            # filename regex + aspect ratio
│   │       ├── screenshot.ts       # no EXIF + screen-sized dims
│   │       ├── dimensions.ts       # min/max side validation
│   │       └── tamper.ts           # EXIF stripped + odd aspect + editor DPI
│   ├── uploads/                    # saved image bytes (gitignored)
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env / .env.example
│   └── README.md
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Upload.tsx          # drag & drop + recent jobs
│   │   │   ├── Status.tsx          # polling page with timeline
│   │   │   └── Results.tsx         # analysis breakdown
│   │   ├── components/             # Dropzone, JobList, ScoreGauge, CheckCard, …
│   │   ├── api.ts                  # typed API client
│   │   ├── App.tsx                 # layout shell + health pill
│   │   ├── main.tsx                # router
│   │   └── styles.css              # light theme — Ginger orange accent
│   ├── vite.config.ts              # /api proxy → backend
│   └── package.json
├── package.json                    # npm workspaces
└── README.md
```

---

## Getting Started

### Prerequisites

- Node.js >= 20
- A Postgres connection string — easiest is a free [Neon](https://neon.tech) project. No local Postgres install required.

### Install and run

```bash
# from repo root — installs both workspaces + runs `prisma generate`
npm install

# 1. Set the connection string
cp backend/.env.example backend/.env
# Open backend/.env and paste your Neon URL into DATABASE_URL

# 2. Apply the schema migration to your database
npm run db:migrate

# 3. Start backend (server + worker, single process)
npm run dev:backend
# → http://localhost:3000

# 4. In another terminal start the frontend
npm run dev:frontend
# → http://localhost:5173
```

The frontend proxies `/api` and `/health` to the backend automatically.

### Useful scripts

| Command                       | Effect                                           |
| ----------------------------- | ------------------------------------------------ |
| `npm run dev:backend`         | tsx watch on `backend/src/server.ts`             |
| `npm run dev:frontend`        | vite dev server                                  |
| `npm run db:migrate`          | `prisma migrate deploy` against `DATABASE_URL`   |
| `npm run build`               | Build both workspaces                            |
| `npm run start:backend`       | Run compiled backend from `dist/`                |
| `npx prisma studio` (in `backend/`) | GUI for the Postgres database               |

---

## API Reference

All examples assume the backend on `http://localhost:3000`. The frontend hits the same paths via the Vite proxy.

### `POST /api/upload`

Accepts `multipart/form-data` with field `image`. Validates mime (`jpeg | png | webp`) and 10 MB size cap.

```bash
curl -F image=@car.jpg http://localhost:3000/api/upload
```

```json
{ "jobId": "uuid", "status": "pending", "message": "Upload accepted" }
```

### `GET /api/status/:id`

```bash
curl http://localhost:3000/api/status/<jobId>
```

```json
{
  "jobId": "...",
  "status": "processing",
  "filename": "car.jpg",
  "attempts": 1,
  "failureReason": null,
  "createdAt": "2026-05-16T…",
  "startedAt": "2026-05-16T…",
  "completedAt": null,
  "updatedAt": "2026-05-16T…"
}
```

### `GET /api/results/:id`

Returns `409` while the job is still `pending` or `processing`; otherwise:

```bash
curl http://localhost:3000/api/results/<jobId>
```

```json
{
  "jobId": "...",
  "status": "completed",
  "filename": "car.jpg",
  "completedAt": "2026-05-16T…",
  "results": [
    { "check": "blur_detection",       "passed": true,  "confidence": 0.91, "details": "…" },
    { "check": "brightness_analysis",  "passed": true,  "confidence": 0.90, "details": "…" },
    { "check": "dimension_validation", "passed": true,  "confidence": 1.0,  "details": "…" },
    { "check": "duplicate_detection",  "passed": true,  "confidence": 1.0,  "details": "…" },
    { "check": "ocr_plate_check",      "passed": false, "confidence": 0.6,  "details": "…" },
    { "check": "screenshot_detection", "passed": true,  "confidence": 0.6,  "details": "…" }
  ]
}
```

### `GET /api/image/:id`

Streams the original bytes — used by the frontend preview.

### `GET /api/jobs?status=&limit=`

```bash
curl 'http://localhost:3000/api/jobs?status=completed&limit=10'
```

```json
{ "count": 10, "items": [ { "jobId": "...", "filename": "...", "status": "completed", … } ] }
```

### `GET /api/stats`

```bash
curl http://localhost:3000/api/stats
```

```json
{ "total": 12, "pending": 0, "processing": 1, "completed": 10, "failed": 1 }
```

### `GET /health`

```json
{ "status": "ok", "checks": { "api": "ok", "db": "ok" } }
```

---

## Architecture

### Service flow

```
Client (React + Vite)
        │
        │  POST /api/upload  (multipart/form-data)
        ▼
  Express server
        │
        ├── validate mime (jpeg/png/webp) + size (10 MB cap)
        ├── compute sha256 of file buffer
        ├── save bytes to backend/uploads/<uuid>.<ext>
        ├── prisma.image.create  (status='pending')
        ├── enqueue(imageId)  → EventEmitter "job:added"
        └── respond 202 { jobId, status: "pending" }
                │
                ▼
       In-memory queue
                │
                ▼
  Worker (same process)
        │
        ├── dequeue one job
        ├── prisma.image.update  (status='processing', attempts++)
        ├── read file from disk
        ├── Promise.allSettled([
        │     blur, brightness, duplicate, plate, screenshot, dimensions, tamper
        │   ])
        ├── prisma.analysisResult.create — one row per check
        └── prisma.image.update  (status='completed' | 'failed')
                │
                ▼
  Client polls GET /api/status/:id  →  GET /api/results/:id
```

### Processing flow

When the worker picks up a job:

```
findImage(imageId)                   ← load row + sha256 + storedPath from DB
  → markProcessing(imageId)          ← status='processing', startedAt=now, attempts++
  → readFile(storedPath)             ← bytes from disk into a Buffer
  → Promise.allSettled([             ← all 7 checks run in parallel
      checkBlur,
      checkBrightness,
      checkDuplicate,
      checkPlate,
      checkScreenshot,
      checkDimensions,
      checkTamper,
    ])
  → for each result → insertResult() ← one analysis_results row per check
  → markCompleted(imageId)           ← status='completed', completedAt=now
```

A check that throws is caught by `allSettled` and persisted as `passed:false, confidence:0`. Only a fatal error (file missing, DB unreachable) flips the job to `failed` via `markFailed()`.

### Queue strategy

The queue is an in-memory `EventEmitter` + array (`backend/src/queue.ts`, ~25 lines). Three operations: `enqueue(imageId)`, `dequeue()`, `onJob(handler)`. The worker subscribes once at boot and drains jobs single-flight (a `isProcessing` flag prevents two parallel runs from popping the same job).

**Why not Redis + BullMQ:**
- Same producer / consumer semantics, zero external dependencies.
- For take-home scope (single dev, hundreds of images) the simplicity wins.
- `queue.ts` is the single integration point — swap it for a BullMQ wrapper and the rest of the code is unchanged.

**Trade-off:** pending jobs are lost on process restart. Documented in [Trade-offs](#trade-offs).

### Major design decisions

| Decision | Why |
|---|---|
| **Same-process worker** | One Node process = one log stream, one place to debug, no IPC. Easy to split later. |
| **In-memory queue** | Avoids Redis / BullMQ install. Same public API as a real queue (`enqueue`, `onJob`). |
| **Postgres on Neon** | Free hosted, real production-shape DB, no Docker needed locally. |
| **Prisma v6 (not v7)** | v7's driver-adapter pattern adds complexity without payoff for two tables. |
| **Raw SQL via Prisma helpers** | Schema is the single source of truth (`schema.prisma`); no manual DDL drift. |
| **`Promise.allSettled` for checks** | One failing check never aborts the others — analysis stays partial-but-useful. |
| **sha256 at upload time** | Same hash powers duplicate detection later → no second pass over bytes. |
| **Multipart in memory (multer memoryStorage)** | We hash + write + analyze the same buffer; no temp files. |
| **UUID v4 ids validated on every `:id` route** | Cheap defence against malformed input + accidental path traversal. |
| **Single `cors()` middleware** | Frontend dev runs on a different port via Vite proxy — explicit CORS keeps prod-equivalent. |

### Job state machine

```
pending  ─►  processing  ─►  completed
                         └─►  failed   (on file-read or DB error)
```

A single check throwing inside `Promise.allSettled` does not fail the job — it writes a row with `passed: false, confidence: 0` and the others continue. Only file-system or DB-level errors push the job to `failed`.

---

## Image Analysis Checks

| Check                   | Method                                                                    | File                     |
| ----------------------- | ------------------------------------------------------------------------- | ------------------------ |
| `blur_detection`        | Sharp `.stats()` — mean channel stdev, threshold 15                       | `checks/blur.ts`         |
| `brightness_analysis`   | Mean pixel value across channels; fail if `<40` or `>220`                 | `checks/brightness.ts`   |
| `duplicate_detection`   | Indexed SQL lookup on `sha256` for a different existing row               | `checks/duplicate.ts`    |
| `ocr_plate_check`       | Filename regex `^[A-Z]{2}\d{1,2}[A-Z]{1,3}\d{4}$` + aspect-ratio sanity   | `checks/plate.ts`        |
| `screenshot_detection`  | No EXIF block + dimensions match a common screen resolution               | `checks/screenshot.ts`   |
| `dimension_validation`  | Reject `<200px` or `>6000px` on either side                               | `checks/dimensions.ts`   |
| `tamper_detection`      | JPEG-with-no-EXIF + unusual aspect ratio + DPI exactly 72/96              | `checks/tamper.ts`       |

Every check returns `{ passed: boolean, confidence: number, details: string }`.

### Confidence scoring

- **Deterministic checks** (`duplicate_detection`, `dimension_validation`) return `1.0` — there's nothing uncertain.
- **Heuristic checks** (`blur`, `brightness`, `screenshot`) scale `0..1` based on distance from the threshold.
- **`ocr_plate_check`** returns `0.6 / 0.8` depending on whether aspect ratio reinforces a regex match — a real-OCR substitute would replace this with Tesseract confidence.
- **`tamper_detection`** sums independent signals (no-EXIF, odd aspect, editor DPI) — `0.7` when clean, `0.4 + 0.2×signals` otherwise (capped at `1.0`).

The frontend Results page computes a *weighted quality score* across checks for at-a-glance triage (see `frontend/src/pages/Results.tsx`).

---

## Database Schema

Generated from `backend/prisma/schema.prisma`:

```prisma
model Image {
  id            String    @id
  filename      String
  storedPath    String    @map("stored_path")
  mimetype      String?
  sizeBytes     Int?      @map("size_bytes")
  sha256        String?
  status        String    @default("pending") // pending | processing | completed | failed
  failureReason String?   @map("failure_reason")
  attempts      Int       @default(0)
  createdAt     DateTime  @default(now()) @map("created_at")
  startedAt     DateTime? @map("started_at")
  completedAt   DateTime? @map("completed_at")
  results       AnalysisResult[]
  @@index([sha256])
  @@index([status])
  @@map("images")
}

model AnalysisResult {
  id         Int      @id @default(autoincrement())
  imageId    String   @map("image_id")
  checkName  String   @map("check_name")
  passed     Boolean
  confidence Float
  details    String?
  createdAt  DateTime @default(now()) @map("created_at")
  image      Image    @relation(fields: [imageId], references: [id], onDelete: Cascade)
  @@index([imageId])
  @@map("analysis_results")
}
```

To change the schema: edit `prisma/schema.prisma`, then `npx prisma migrate dev --name <change>` from inside `backend/`.

---

## Trade-offs

### Simplified intentionally
- **No real OCR.** Tesseract.js has a 5–15 s cold start that dominates the first job. The plate heuristic uses a filename regex + aspect-ratio sanity check — enough to demonstrate the pipeline, not enough for production.
- **No retry logic.** A worker exception logs and the job is marked `failed`. No exponential backoff, no attempts cap — the database column exists but is only incremented to `1`.
- **No rate limiting** or **authentication**.
- **`console.log`** instead of structured logging.

### What would change in production

| Concern        | Now                            | Production                                       |
| -------------- | ------------------------------ | ------------------------------------------------ |
| Database       | Postgres on Neon (free tier)   | Postgres on a managed tier with PITR + replicas  |
| Queue          | In-memory `EventEmitter`       | BullMQ + Redis (or SQS / Cloud Tasks)            |
| File storage   | local `backend/uploads/`       | S3 / GCS with signed-URL uploads                 |
| Worker         | Same process                   | Separate worker pool, horizontally scalable      |
| OCR            | Filename regex                 | Tesseract / Google Vision / AWS Textract         |
| Auth           | None                           | API keys or short-lived JWTs                     |
| Logging        | `console.*`                    | Structured JSON (pino) + log aggregation         |
| CI             | None                           | GitHub Actions: typecheck + tests + prisma diff  |

### Scalability concerns
- Single-process worker → single point of failure; one slow check blocks the next job.
- In-memory queue → all pending work lost on restart; no horizontal scale-out.
- `uploads/` grows unbounded → needs cleanup / cold-storage policy.
- No resize-before-analyze → memory spikes on huge images (Sharp loads the full raster).
- Neon free tier idles connections; first request after idle pays a cold-start.

### Failure handling

| Failure | What happens now | What's missing |
|---|---|---|
| Single check throws | `Promise.allSettled` catches → row with `passed:false, confidence:0` saved → job still completes | A retry policy per-check |
| Worker crashes mid-job | DB row stays `processing` forever; in-memory queue is wiped | Heartbeat + reaper to flip stale `processing` rows back to `pending` |
| Stored file missing on disk | `markFailed()` with `"Could not read stored file"` reason | Hash + size verification before analysis |
| DB unreachable | `markProcessing()` throws → caught by worker's outer try → next job continues; `/health` flips to `503` | Reconnect with backoff + circuit breaker |
| Upload exceeds 10 MB | Multer rejects → 500 (currently surfaces as generic error) | Explicit 413 handler with friendly message |
| Same image uploaded twice | Two jobs run, both succeed, `duplicate_detection` flags the second one | Short-circuit at upload: return existing `jobId` (idempotent) |
| Malformed `:id` | `isValidUUID()` rejects with 400 before hitting DB | — |

---

## AI Usage Disclosure

Claude (Anthropic, via Claude Code) was the main collaborator. The intent was to learn the patterns end-to-end while letting AI handle the boilerplate.

### Where AI was used
- **Scaffolding** — repo layout, `package.json` scripts, `tsconfig`, Prisma schema, Vite + React setup.
- **Routine code** — Express route handlers, Multer setup, Prisma client wrappers, error-handling middleware.
- **Inline algorithms** — Laplacian variance for blur, Sharp `.stats()` interpretation, Indian plate regex.
- **Frontend** — React component skeletons, CSS tokens, light theme that matches the Ginger Media Group public site.
- **README + comments** — first drafts of every section in this file.

### What AI helped with
- Producing a working skeleton fast, so iteration time was spent on real decisions (queue strategy, schema, check thresholds) instead of plumbing.
- Surfacing the trade-off table for each pivot (e.g. "BullMQ vs in-memory" presented both sides before I picked one).
- Generating mechanical edits — renames, doc-comments, refactors — across many files at once.

### Where AI output was wrong (real examples)
- **Over-engineered the first draft.** Initial Claude version used Prisma v7 driver adapters + BullMQ + Redis + Postgres in Docker. None of it was warranted for this scope; rejected and rebuilt simpler.
- **Latent bug in duplicate detection.** An earlier perceptual-hash tier called `hammingDistance(undefined, ...)` because the worker passed three args to a four-arg function. Caught while reading the diff, the whole tier was removed in favour of exact-sha256 matching.
- **Schema datasource silently removed.** During a "clean up the schema" pass the `generator client` + `datasource db` blocks were stripped out — Prisma can't function without them. Caught when `/health` flipped to `db: down`.
- **`tsconfig` thrash.** Multiple back-and-forth attempts on `moduleResolution` deprecations before settling on `Node16` + `Node16` + no `ignoreDeprecations` flag.
- **Stale CSS class references** after the dark→light theme rewrite — a few components referenced removed colour vars; spotted on first browser load.
- **Postgres + Neon pooler quirks** weren't anticipated; first migration failed on `migration_lock.toml` provider mismatch — required wiping `prisma/migrations/`.

### How AI-generated code was validated
- **`tsc --noEmit`** after every change. No `any`-rich code accepted without a real type.
- **`curl /health` + manual smoke uploads** after each backend change — verified the API contract still matched the frontend.
- **Browser test** for every UI change — manual click-through of Upload → Status → Results.
- **`Promise.allSettled` outputs eyeballed** for each check by running a real image through and reading the JSON.
- **Threshold sanity** — uploaded photos with known properties (a sharp DSLR shot, a phone screenshot, a duplicate, a tiny thumbnail) and confirmed each check produced the expected pass/fail with reasonable confidence.
- **Line-by-line code review** before merging any large generated patch; pieces that hid behaviour (long inline regex, single-letter variable names) were rewritten by hand.

The principle throughout: nothing ships unless I can explain it in one sentence and point to the file it lives in.

---

## Bonus items (assignment extras)

Honest status of the optional asks:

| Item | Status | Note |
|---|---|---|
| **Docker setup** | Not included | DB now lives on Neon (no local Postgres process), queue is in-memory (no Redis), Vite + tsx run natively. Adding a Dockerfile would only wrap `npm install && npm run build && npm start` — happy to add if needed. |
| **Seed script** | Not included | Would live at `backend/prisma/seed.ts` invoked via `prisma db seed` — insert ~5 placeholder image rows with mixed statuses for instant UI demo. |
| **Test scripts** | Not included | Would add Vitest unit tests per check (synthetic Buffers via Sharp `.create()`) and a Supertest smoke test over the 7 routes against a sqlite-memory Prisma instance. |

These were skipped to keep the project explainable end-to-end rather than half-built. None are blockers for a reviewer running the app.

---

## Table of Contents (recap)

- [Stack](#stack) · [Project Structure](#project-structure) · [Getting Started](#getting-started)
- [API Reference](#api-reference)
- [Architecture](#architecture) → service flow · processing flow · queue strategy · major design decisions · job state machine
- [Image Analysis Checks](#image-analysis-checks)
- [Database Schema](#database-schema)
- [Trade-offs](#trade-offs) → simplified · production deltas · scalability · failure handling
- [AI Usage Disclosure](#ai-usage-disclosure) → where used · what helped · where wrong · how validated
- [Bonus items](#bonus-items-assignment-extras)
