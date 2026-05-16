import sharp from "sharp";

type Result = {
  passed: boolean;
  confidence: number;
  details: string;
};

// Common camera aspect ratios. Anything far from these is suspicious.
const COMMON_ASPECT_RATIOS = [4 / 3, 3 / 2, 16 / 9, 1.0, 3 / 4, 2 / 3, 9 / 16];
const ASPECT_TOLERANCE = 0.05; // ±5% from nearest common ratio

// DPI values that desktop editors export by default.
const EDITOR_DPI_VALUES = new Set([72, 96]);

function nearestAspectRatioDistance(ratio: number): number {
  return Math.min(
    ...COMMON_ASPECT_RATIOS.map((commonRatio) => Math.abs(ratio - commonRatio) / commonRatio),
  );
}

/**
 * Detect signs an image was edited / re-exported.
 *
 * Three independent signals — more signals → higher confidence.
 *   1. JPEG with stripped EXIF (real cameras embed it).
 *   2. Aspect ratio that doesn't match any common camera ratio.
 *   3. DPI of exactly 72 or 96 (Photoshop / Lightroom default export).
 */
export async function checkTamper(buffer: Buffer): Promise<Result> {
  try {
    const info = await sharp(buffer).metadata();
    const signals: string[] = [];

    // 1. JPEG without EXIF.
    if (info.format === "jpeg" && !info.exif) {
      signals.push("JPEG with no EXIF (often stripped by editors)");
    }

    // 2. Suspicious aspect ratio.
    if (info.width && info.height) {
      const aspectRatio = info.width / info.height;
      const distance = nearestAspectRatioDistance(aspectRatio);
      if (distance > ASPECT_TOLERANCE) {
        signals.push(
          `unusual aspect ratio ${info.width}x${info.height} (≈${aspectRatio.toFixed(2)})`,
        );
      }
    }

    // 3. Editor-default DPI.
    if (info.density && EDITOR_DPI_VALUES.has(info.density)) {
      signals.push(`DPI = ${info.density} (common editor export setting)`);
    }

    if (signals.length === 0) {
      return {
        passed: true,
        confidence: 0.7,
        details: "No tamper signals detected",
      };
    }

    // Confidence climbs with each independent signal.
    const confidence = Math.min(1, 0.4 + signals.length * 0.2);
    return {
      passed: false,
      confidence: Number(confidence.toFixed(2)),
      details: `Possible tampering — ${signals.join("; ")}`,
    };
  } catch (error) {
    console.error("[tamper] failed:", error);
    return {
      passed: false,
      confidence: 0,
      details: `Could not analyze tampering: ${(error as Error).message}`,
    };
  }
}
