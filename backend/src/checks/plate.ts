import sharp from "sharp";

type Result = {
  passed: boolean;
  confidence: number;
  details: string;
};

// Indian standard plate format: AA00AA0000 (e.g. MH12DE1433).
const INDIAN_PLATE_REGEX = /\b([A-Z]{2}[0-9]{1,2}[A-Z]{1,3}[0-9]{4})\b/i;

// Real licence plates are wider than they are tall.
const MIN_ASPECT_RATIO = 1.4;
const MAX_ASPECT_RATIO = 6;

/**
 * Detect whether an image looks like it contains an Indian number plate.
 *
 * Two signals (no OCR — too heavyweight for this scope):
 *   1. Filename matches the standard Indian plate regex.
 *   2. Image aspect ratio is plate-like (wider than tall).
 *
 * A production check would call Tesseract / Google Vision / AWS Textract.
 */
export async function checkPlate(
  filename: string,
  buffer: Buffer,
): Promise<Result> {
  const filenameMatch = filename.toUpperCase().match(INDIAN_PLATE_REGEX);

  let aspectLooksLikePlate = false;
  try {
    const info = await sharp(buffer).metadata();
    if (info.width && info.height) {
      const aspectRatio = info.width / info.height;
      aspectLooksLikePlate =
        aspectRatio >= MIN_ASPECT_RATIO && aspectRatio <= MAX_ASPECT_RATIO;
    }
  } catch (error) {
    console.error("[plate] failed to read image:", error);
  }

  if (filenameMatch) {
    const plateNumber = filenameMatch[1].toUpperCase();
    return {
      passed: true,
      confidence: aspectLooksLikePlate ? 0.8 : 0.6,
      details: `Plate pattern found in filename: ${plateNumber}${aspectLooksLikePlate ? " (aspect ratio looks plate-like)" : ""}`,
    };
  }

  return {
    passed: false,
    confidence: aspectLooksLikePlate ? 0.4 : 0.6,
    details: "No Indian plate pattern detected in filename",
  };
}
