import { findDuplicateBySha } from "../db";

type Result = {
  passed: boolean;
  confidence: number;
  details: string;
};

/**
 * Detect whether this image is an exact duplicate of an earlier upload.
 *
 * Compares the SHA-256 hash (computed at upload time) against every other
 * image row. The lookup is on an indexed column, so it stays cheap as the
 * dataset grows.
 */
export async function checkDuplicate(
  imageId: string,
  sha256: string | null,
): Promise<Result> {
  if (!sha256) {
    return {
      passed: true,
      confidence: 0.5,
      details: "No hash available — cannot compare",
    };
  }

  try {
    const existingImage = await findDuplicateBySha(imageId, sha256);

    if (existingImage) {
      return {
        passed: false,
        confidence: 1.0,
        details: `Duplicate of image ${existingImage.id} uploaded ${existingImage.createdAt.toISOString()}`,
      };
    }

    return {
      passed: true,
      confidence: 1.0,
      details: `Unique image (sha256: ${sha256.slice(0, 12)}…)`,
    };
  } catch (error) {
    console.error("[duplicate] failed:", error);
    return {
      passed: false,
      confidence: 0,
      details: `Lookup failed: ${(error as Error).message}`,
    };
  }
}
