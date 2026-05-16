import sharp from "sharp";

type Result = {
  passed: boolean;
  confidence: number;
  details: string;
};

// Pixel values range from 0 (black) to 255 (white).
const MIN_BRIGHTNESS = 40;   // below = too dark to read
const MAX_BRIGHTNESS = 220;  // above = blown out / overexposed

/**
 * Check whether an image is well exposed.
 *
 * Uses Sharp's per-channel mean. Outside the [MIN, MAX] window the image
 * is either too dark or too bright to be useful.
 */
export async function checkBrightness(buffer: Buffer): Promise<Result> {
  try {
    const imageStats = await sharp(buffer).stats();

    const totalMean = imageStats.channels.reduce(
      (sum, channel) => sum + channel.mean,
      0,
    );
    const averageBrightness = totalMean / imageStats.channels.length;

    let passed = true;
    let label = "well lit";

    if (averageBrightness < MIN_BRIGHTNESS) {
      passed = false;
      label = "too dark";
    } else if (averageBrightness > MAX_BRIGHTNESS) {
      passed = false;
      label = "too bright";
    }

    return {
      passed,
      confidence: 0.9,
      details: `Average brightness: ${averageBrightness.toFixed(1)}/255 — ${label} (ok range: ${MIN_BRIGHTNESS}-${MAX_BRIGHTNESS})`,
    };
  } catch (error) {
    console.error("[brightness] failed:", error);
    return {
      passed: false,
      confidence: 0,
      details: `Could not analyze brightness: ${(error as Error).message}`,
    };
  }
}
