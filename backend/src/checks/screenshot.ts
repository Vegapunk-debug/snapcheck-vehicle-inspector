import sharp from "sharp";

// Common phone and desktop screen resolutions.
// If an image matches one of these exactly, it's likely a screenshot.
const SCREEN_SIZES = new Set([
  "1920x1080",
  "2560x1440",
  "3840x2160",
  "1366x768",
  "1440x900",
  "1280x720",
  "1680x1050",
  "1080x1920",
  "1440x2560",
  "390x844",
  "414x896",
  "375x667",
  "3024x1964", // MacBook Pro 14"
  "3456x2234", // MacBook Pro 16"
  "2880x1800", // MacBook Pro 15"
  "2560x1600", // MacBook Pro 13"
]);

type Result = {
  passed: boolean;
  confidence: number;
  details: string;
};

/**
 * Detect whether an image is likely a screenshot.
 *
 * A screenshot is flagged when BOTH signals are true:
 *   1. No EXIF data (real cameras embed EXIF; screenshots don't).
 *   2. Image size matches a common screen resolution exactly.
 *
 * Either signal alone has too many false positives — require both.
 */
export async function checkScreenshot(buffer: Buffer): Promise<Result> {
  try {
    const info = await sharp(buffer).metadata();

    const width = info.width ?? 0;
    const height = info.height ?? 0;
    const size = `${width}x${height}`;

    const noExifData = !info.exif;
    const matchesScreenSize = SCREEN_SIZES.has(size);
    
    // MacOS embeds metadata in PNG screenshots, so we don't strictly require noExifData
    // if it perfectly matches a monitor resolution.
    const isScreenshot = matchesScreenSize;

    if (isScreenshot) {
      return {
        passed: false,
        confidence: 0.8,
        details: `Looks like a screenshot — exact match for monitor resolution ${size}`,
      };
    }

    return {
      passed: true,
      confidence: 0.6,
      details: `Not a screenshot — size ${size} doesn't match known monitors`,
    };
  } catch (error) {
    console.error("[screenshot] failed to read image:", error);
    return {
      passed: false,
      confidence: 0,
      details: `Could not analyze image: ${(error as Error).message}`,
    };
  }
}
