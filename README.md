<div align="center">

# SnapCheck

<img src="https://img.shields.io/badge/TypeScript-007ACC?style=flat-square&logo=typescript&logoColor=white"/>
<img src="https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=nodedotjs&logoColor=white"/>
<img src="https://img.shields.io/badge/Express-000000?style=flat-square&logo=express&logoColor=white"/>
<img src="https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white"/>
<img src="https://img.shields.io/badge/React-61DAFB?style=flat-square&logo=react&logoColor=black"/>
<img src="https://img.shields.io/badge/Prisma-2D3748?style=flat-square&logo=prisma&logoColor=white"/>
<img src="https://img.shields.io/badge/Sharp-99CC00?style=flat-square&logo=sharp&logoColor=white"/>
<img src="https://img.shields.io/badge/Vite-646CFF?style=flat-square&logo=vite&logoColor=white"/>

**Async vehicle image inspection pipeline.**
Upload an image — get back 7 structured checks processed through an in-memory queue.

[![Live Demo](https://img.shields.io/badge/Live%20Demo-Railway-6B00F5?style=flat-square&logo=railway&logoColor=white)](https://snapcheck-frontend-production.up.railway.app)

> No Redis. Just Node.js >= 20, Docker, and Tesseract.js OCR.

</div>

<div align="center">
  <img src="./demo/snapp.gif" alt="SnapCheck Demo Walkthrough GIF" width="800" />
  <br /><br />
  <!-- Replace the src below with the name of your video file once uploaded -->
  <video src="./demo/demo-video.mp4" controls width="800"></video>
</div>

---

## Table of Contents

- [Tech Stack](#stack)
- [Getting Started](#getting-started)
- [API Reference](#api-reference)
- [Architecture](#architecture)
- [Image Analysis Checks](#image-analysis-checks)
- [Database Schema](#database-schema)
- [Trade-offs](#trade-offs)
- [AI Usage Disclosure](#ai-usage-disclosure)
- [Bonus items](#bonus-items)

---

## Tech Stack

| Layer            | Choice                                            |
| ---------------- | ------------------------------------------------- |
| Frontend         | React 18 + Vite + react-router-dom + TypeScript   |
| Backend          | Node 20 + Express + TypeScript                    |
| Database         | PostgreSQL on Neon via Prisma v6                  |
| Queue            | In-memory (Node `EventEmitter` + array)           |
| Image processing | Sharp                                             |
| File uploads     | Multer (memory storage)                           |
| IDs              | uuid v4                                           |

---

## Getting Started

### Prerequisites

- Node.js >= 20
- A Postgres database. You can either use a free [Neon](https://neon.tech) project OR run it locally using Docker (a `docker-compose.yml` is provided).

### Install and run

```bash
# from repo root — installs both workspaces + runs `prisma generate`
npm install

# 1. Set the connection string
cp backend/.env.example backend/.env

# Option A: Cloud Database (No Docker required)
# Open backend/.env and paste your Neon URL into DATABASE_URL

# Option B: Local Database via Docker
docker compose up -d
# Then open backend/.env and set:
# DATABASE_URL="postgresql://snapcheck:password@localhost:5432/snapcheck_db?schema=public"

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

All examples assume the backend on `http://localhost:3000`.

| Method | Endpoint | Description | Response |
|--------|----------|-------------|----------|
| POST | `/api/upload` | Upload image (multipart) | `202 { jobId, status: "pending" }` |
| GET | `/api/status/:id` | Poll job status | `{ status, attempts, timestamps }` |
| GET | `/api/results/:id` | Fetch analysis results | `409` if not ready |
| GET | `/api/jobs` | List recent jobs | `?status=&limit=` |
| GET | `/api/stats` | Counts by status | `{ total, pending, completed... }` |
| GET | `/api/image/:id` | Raw image bytes | For frontend preview |
| GET | `/health` | Liveness check | `{ status, checks }` |

```bash
curl -F image=@car.jpg http://localhost:3000/api/upload
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

### Queue strategy

The queue is an in-memory `EventEmitter` and array. Three operations are exposed: `enqueue(imageId)`, `dequeue()`, `onJob(handler)`. The worker subscribes once at boot and drains jobs single-flight.

**Why not Redis + BullMQ:**
- Same producer and consumer semantics with zero external dependencies.
- Simple to swap for a BullMQ wrapper later without changing integration code.

### Major design decisions

| Decision | Why |
|---|---|
| **Same-process worker** | One Node process for easy debugging without IPC. |
| **In-memory queue** | Avoids Redis install while keeping public API shape. |
| **Postgres on Neon** | Free hosted database, no local Docker required. |
| **Prisma v6 (not v7)** | Avoids driver-adapter complexity for just two tables. |
| **Raw SQL via Prisma helpers** | Schema acts as the single source of truth. |
| **`Promise.allSettled`** | Failing checks do not abort the remaining analysis. |
| **sha256 at upload time** | Single pass over bytes powers duplicate detection. |
| **Multipart in memory** | Hash, write, and analyze the same buffer directly. |
| **UUID v4 validation** | Cheap defence against path traversal and bad input. |
| **Single `cors()` middleware** | Simplifies explicit cross-origin resource sharing. |

### Job state machine

```
pending  ─►  processing  ─►  completed
                         └─►  failed   (on file-read or DB error)
```

A single check throwing inside `Promise.allSettled` does not fail the job. It writes a row with `passed: false` and the others continue.

---

## Image Analysis Checks

<table>
<tr>
<td><strong>blur_detection</strong><br/>Sharp stdev &lt; 15<br/><code>confidence: dynamic</code></td>
<td><strong>brightness_analysis</strong><br/>Mean &lt;40 dark, &gt;220 bright<br/><code>confidence: 0.9</code></td>
<td><strong>duplicate_detection</strong><br/>SHA256 DB lookup<br/><code>confidence: 1.0</code></td>
</tr>
<tr>
<td><strong>ocr_plate_check</strong><br/>Real OCR via Tesseract.js & API fallback (Standard & BH Series plates)<br/><code>confidence: 0.7–1.0</code></td>
<td><strong>screenshot_detection</strong><br/>No EXIF + screen dims<br/><code>confidence: 0.75</code></td>
<td><strong>dimension_validation</strong><br/>200px – 6000px bounds<br/><code>confidence: 1.0</code></td>
</tr>
<tr>
<td><strong>tamper_detection</strong><br/>No EXIF + odd aspect + editor DPI<br/><code>confidence: 0.4–0.9</code></td>
<td></td>
<td></td>
</tr>
</table>

### Confidence scoring

- **Deterministic checks** return `1.0`.
- **Heuristic checks** scale `0..1` based on distance from the threshold.
- **`ocr_plate_check`** returns confidence based on the Tesseract engine's confidence output, falling back to the PlateRecognizer API and filename heuristics if OCR fails. It detects both Standard and Bharat Series (BH) plates.
- **`tamper_detection`** sums independent signals and caps at `1.0`.

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

To change the schema edit `prisma/schema.prisma` and run `npx prisma migrate dev --name <change>`.

---

## Trade-offs

### Simplified intentionally
- **No retry logic.** Exceptions fail the job without exponential backoff.
- **No rate limiting** or authentication logic implemented.
- **`console.log`** is used instead of structured JSON logging.

### What would change in production

| Concern        | Now                            | Production                                       |
| -------------- | ------------------------------ | ------------------------------------------------ |
| Database       | Postgres on Neon (free tier)   | Postgres on a managed tier with PITR + replicas  |
| Queue          | In-memory `EventEmitter`       | BullMQ + Redis (or SQS / Cloud Tasks)            |
| File storage   | local `backend/uploads/`       | S3 / GCS with signed-URL uploads                 |
| Worker         | Same process                   | Separate worker pool, horizontally scalable      |
| OCR            | Tesseract.js (Node worker)     | Tesseract / Google Vision / AWS Textract         |
| Auth           | None                           | API keys or short-lived JWTs                     |
| Logging        | `console.*`                    | Structured JSON (pino) + log aggregation         |
| CI             | None                           | GitHub Actions: typecheck + tests + prisma diff  |

### Scalability concerns
- Single-process worker means one slow check blocks the next job.
- In-memory queue loses pending work on application restart.
- Local `uploads/` grows unbounded without a cleanup policy.
- Memory spikes occur on huge images due to full raster loading.

### Failure handling

| Failure | What happens now | What's missing |
|---|---|---|
| Single check throws | Caught by `allSettled` and logged. | Per-check retry policy |
| Worker crashes | Row stays `processing` forever. | Reaper to revert stale rows |
| File missing on disk | Fails job entirely. | Hash verification before analysis |
| DB unreachable | Caught by outer try block. | Reconnect with backoff |
| Upload > 10 MB | Multer rejects with 500 error. | 413 handler with friendly message |
| Duplicate upload | Detected post-analysis. | Short-circuit at upload |

---

## AI Usage Disclosure

### Where AI was used
- Scaffolding repository layout and frontend configurations.
- Generating routine Express routes and Prisma wrappers.
- Writing inline algorithms like Laplacian variance and regex.
- Styling frontend component skeletons and CSS tokens.

### What AI helped with
- Rapid prototyping to focus entirely on design decisions.
- Highlighting queue and architecture trade-offs.
- Generating mechanical refactors across multiple files.

### Where AI output was wrong
- Initially over-engineered with Docker and driver adapters.
- Introduced a latent bug using `hammingDistance(undefined)`.
- Stripped required Prisma blocks during schema cleanup.
- Used stale CSS class references after a theme rewrite.

### How AI-generated code was validated
- Passed `tsc --noEmit` locally.
- Verified API contracts using `curl /health`.
- Tested all UI state changes manually in the browser.
- Reviewed statistical outputs for threshold sanity.

---

## Bonus items

| Item | Status | Note |
|---|---|---|
| **Docker setup** | **Included** | Provided `docker-compose.yml` for local Postgres testing. |
| **Seed script** | Not included | Would live at `backend/prisma/seed.ts`. |
| **Test scripts** | Not included | Would add Vitest unit tests and Supertest smoke tests. |

# Thank You !
