import sharp from "sharp";

type Result = {
  passed: boolean;
  confidence: number;
  details: string;
};

const MIN_PIXELS = 200;   // anything smaller is unusable
const MAX_PIXELS = 6000;  // anything larger is usually a scanner mistake

/**
 * Check whether an image's dimensions are within an acceptable range.
 *
 * Too small (thumbnails) and too large (scanner output) are both flagged.
 */
export async function checkDimensions(buffer: Buffer): Promise<Result> {
  try {
    const info = await sharp(buffer).metadata();
    const width = info.width ?? 0;
    const height = info.height ?? 0;

    if (width < MIN_PIXELS || height < MIN_PIXELS) {
      return {
        passed: false,
        confidence: 1.0,
        details: `${width}x${height} — too small (minimum ${MIN_PIXELS}px on either side)`,
      };
    }

    if (width > MAX_PIXELS || height > MAX_PIXELS) {
      return {
        passed: false,
        confidence: 1.0,
        details: `${width}x${height} — too large (maximum ${MAX_PIXELS}px on either side)`,
      };
    }

    return {
      passed: true,
      confidence: 1.0,
      details: `${width}x${height} — within the ${MIN_PIXELS}-${MAX_PIXELS}px range`,
    };
  } catch (error) {
    console.error("[dimensions] failed:", error);
    return {
      passed: false,
      confidence: 0,
      details: `Could not read dimensions: ${(error as Error).message}`,
    };
  }
}
