import { PrismaClient } from "@prisma/client";

/**
 * Prisma client + every database helper the app uses.
 *
 * Why SQLite: zero infra (no Docker, no Postgres install), single file,
 * fast enough for take-home scope.
 *
 * The schema lives in prisma/schema.prisma. After editing it run:
 *   npx prisma migrate dev --name <change-description>
 */

export const prisma = new PrismaClient();

// Used by the /health endpoint to confirm the database is reachable.
export async function ping(): Promise<void> {
  await prisma.image.findFirst();
}

type CreateImageInput = {
  id: string;
  filename: string;
  storedPath: string;
  mimetype: string;
  sizeBytes: number;
  sha256: string;
};

// Insert a new image row in `pending` state.
export async function createImage(input: CreateImageInput): Promise<void> {
  await prisma.image.create({ data: input });
}

// Fetch one image by its UUID. Returns null if not found.
export async function findImage(id: string) {
  return prisma.image.findUnique({ where: { id } });
}

// Find any other image with the same SHA-256 hash.
// Used by the duplicate check.
export async function findDuplicateBySha(imageId: string, sha256: string) {
  return prisma.image.findFirst({
    where: { sha256, NOT: { id: imageId } },
    select: { id: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
}

// Move the image into `processing`, stamp started_at, bump attempt counter.
export async function markProcessing(id: string): Promise<void> {
  await prisma.image.update({
    where: { id },
    data: {
      status: "processing",
      startedAt: new Date(),
      attempts: { increment: 1 },
    },
  });
}

// Mark the image as successfully analyzed.
export async function markCompleted(id: string): Promise<void> {
  await prisma.image.update({
    where: { id },
    data: { status: "completed", completedAt: new Date() },
  });
}

// Mark the image as failed with a human-readable reason.
export async function markFailed(id: string, reason: string): Promise<void> {
  await prisma.image.update({
    where: { id },
    data: {
      status: "failed",
      failureReason: reason,
      completedAt: new Date(),
    },
  });
}

// Save one check result row for an image.
export async function insertResult(
  imageId: string,
  checkName: string,
  passed: boolean,
  confidence: number,
  details: string,
): Promise<void> {
  await prisma.analysisResult.create({
    data: { imageId, checkName, passed, confidence, details },
  });
}

// Fetch all check results for an image, formatted for the API response.
export async function getResults(imageId: string) {
  const rows = await prisma.analysisResult.findMany({
    where: { imageId },
    orderBy: { checkName: "asc" },
  });
  return rows.map((row) => ({
    check: row.checkName,
    passed: row.passed,
    confidence: row.confidence,
    details: row.details ?? "",
  }));
}

// List recent jobs, optionally filtered by status.
export async function listImages(status: string | null, limit: number) {
  return prisma.image.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

// Count images grouped by status — used by the /api/stats endpoint.
export async function countByStatus() {
  const groupedRows = await prisma.image.groupBy({
    by: ["status"],
    _count: { _all: true },
  });

  const counts = {
    total: 0,
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
  };

  for (const row of groupedRows) {
    (counts as Record<string, number>)[row.status] = row._count._all;
    counts.total += row._count._all;
  }

  return counts;
}
