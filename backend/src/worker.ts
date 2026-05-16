import fs from "node:fs/promises";
import * as db from "./db";
import { dequeue, onJob, pendingCount } from "./queue";
import { checkBlur } from "./checks/blur";
import { checkBrightness } from "./checks/brightness";
import { checkDuplicate } from "./checks/duplicate";
import { checkPlate } from "./checks/plate";
import { checkScreenshot } from "./checks/screenshot";
import { checkDimensions } from "./checks/dimensions";
import { checkTamper } from "./checks/tamper";

/**
 * Background worker.
 *
 * Runs in the same Node process as the HTTP server. Every time a job is
 * added to the queue, the worker wakes up, drains pending jobs one at a
 * time, and runs all six checks in parallel for each image.
 */

// Names stored in the DB so the frontend has a stable identifier per check.
const CHECK_NAMES = {
  blur: "blur_detection",
  brightness: "brightness_analysis",
  duplicate: "duplicate_detection",
  plate: "ocr_plate_check",
  screenshot: "screenshot_detection",
  dimensions: "dimension_validation",
  tamper: "tamper_detection",
} as const;

// Set to true while a job is running so two `processNextJob` calls don't
// pop the same job. Acts like a single-flight mutex.
let isProcessing = false;

/**
 * Pop one job from the queue and run it. Recursively schedules the next
 * call if more jobs are still pending after the current one finishes.
 */
async function processNextJob(): Promise<void> {
  if (isProcessing) return;

  const job = dequeue();
  if (!job) return;

  isProcessing = true;
  try {
    await runImageAnalysis(job.imageId);
  } catch (error) {
    console.error("[worker] unexpected error:", error);
  } finally {
    isProcessing = false;
    if (pendingCount() > 0) setImmediate(processNextJob);
  }
}

/**
 * Run all six checks for a single image and save the results.
 *
 * State transitions: pending → processing → (completed | failed)
 */
async function runImageAnalysis(imageId: string): Promise<void> {
  console.log(`[worker] starting job for image=${imageId}`);

  const image = await db.findImage(imageId);
  if (!image) {
    console.error(`[worker] image ${imageId} not found in DB`);
    return;
  }

  await db.markProcessing(imageId);

  // Read the image bytes from disk. A failure here is fatal for this job.
  let imageBuffer: Buffer;
  try {
    imageBuffer = await fs.readFile(image.storedPath);
  } catch (error) {
    console.error("[worker] file read failed:", error);
    await db.markFailed(imageId, `Could not read stored file: ${(error as Error).message}`);
    return;
  }

  // Run all six checks in parallel. Promise.allSettled means a single
  // failing check does NOT abort the others.
  const checkResults = await Promise.allSettled([
    
    checkBrightness(imageBuffer),
    
    
    
    checkDimensions(imageBuffer),
    
  ]);

  const checkNamesInOrder = [
    CHECK_NAMES.blur,
    CHECK_NAMES.brightness,
    CHECK_NAMES.duplicate,
    CHECK_NAMES.plate,
    CHECK_NAMES.screenshot,
    CHECK_NAMES.dimensions,
    CHECK_NAMES.tamper,
  ];

  // Save one row per check, regardless of pass / fail / threw.
  for (let i = 0; i < checkResults.length; i++) {
    const result = checkResults[i];
    const checkName = checkNamesInOrder[i];

    if (result.status === "fulfilled") {
      await db.insertResult(
        imageId,
        checkName,
        result.value.passed,
        result.value.confidence,
        result.value.details,
      );
    } else {
      console.error(`[worker] check ${checkName} threw:`, result.reason);
      await db.insertResult(
        imageId,
        checkName,
        false,
        0,
        `Check threw: ${String(result.reason)}`,
      );
    }
  }

  await db.markCompleted(imageId);
  console.log(`[worker] finished job for image=${imageId}`);
}

// Wire up the queue listener. Called once at startup from server.ts.
export function startWorker(): void {
  onJob(() => { void processNextJob(); });
  console.log("[worker] listening (in-memory queue)");
}
