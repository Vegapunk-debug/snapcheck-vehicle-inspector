import sharp from "sharp";

type Result = {
  passed: boolean;
  confidence: number;
  details: string;
};

// Below this stdev value, the image is visibly blurry.
// Picked empirically — clear photos sit between 30 and 60.
const STDEV_THRESHOLD = 15;

/**
 * Detect whether an image is blurry.
 *
 * Idea: sharp images have lots of pixel-to-pixel variation (high stdev
 * across colour channels). Blurry images smooth that variation out, so
 * the stdev drops.
 */
export async function checkBlur(buffer: Buffer): Promise<Result> {
  try {
    const imageStats = await sharp(buffer).stats();

    // Average the per-channel standard deviation. Lower number = blurrier.
    const totalStdev = imageStats.channels.reduce(
      (sum, channel) => sum + channel.stdev,
      0,
    );
    const averageStdev = totalStdev / imageStats.channels.length;

    const isSharp = averageStdev >= STDEV_THRESHOLD;

    // Confidence scales with how far we are from the threshold (clamped 0..1).
    const distanceFromThreshold =
      Math.abs(averageStdev - STDEV_THRESHOLD) / STDEV_THRESHOLD;
    const confidence = Math.max(0, Math.min(1, distanceFromThreshold));

    return {
      passed: isSharp,
      confidence: Number(confidence.toFixed(2)),
      details: `Average stdev: ${averageStdev.toFixed(1)} (threshold: ${STDEV_THRESHOLD}) — ${isSharp ? "sharp" : "blurry"}`,
    };
  } catch (error) {
    console.error("[blur] failed:", error);
    return {
      passed: false,
      confidence: 0,
      details: `Could not analyze blur: ${(error as Error).message}`,
    };
  }
}
