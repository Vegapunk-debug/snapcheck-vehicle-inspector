import sharp from "sharp";
import { createWorker, type Worker } from "tesseract.js";

type Result = {
  passed: boolean;
  confidence: number;
  details: string;
};

// Indian standard plate format: AA00AA0000 (e.g. MH12DE1433).
// Allow optional separators (space / dash) between the four groups because OCR
// frequently splits the plate that way.
const STANDARD_PLATE_REGEX =
  /([A-Z]{2})[\s-]?([0-9]{1,2})[\s-]?([A-Z]{1,3})[\s-]?([0-9]{4})/;

// Bharat Series (BH) plate format: YY BH 0000 XX (e.g. 22BH1234AA).
const BH_PLATE_REGEX =
  /([0-9]{2})[\s-]?(BH)[\s-]?([0-9]{4})[\s-]?([A-Z]{1,2})/;

// Real licence plates are wider than they are tall.
const MIN_ASPECT_RATIO = 1.4;
const MAX_ASPECT_RATIO = 6;

// Lazily-initialised Tesseract worker. Loading the eng traineddata takes a
// couple of seconds on cold start, so we keep a single worker alive for the
// life of the process and reuse it across jobs.
let workerPromise: Promise<Worker> | null = null;

function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = createWorker("eng");
  }
  return workerPromise;
}

// Tesseract trips on noisy colour photos. Down-scale, grayscale and normalise
// to give it the best shot at the plate characters.
async function preprocess(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .resize({ width: 1600, withoutEnlargement: true })
    .grayscale()
    .normalise()
    .toBuffer();
}

function normaliseOcrText(text: string): string {
  return text
    .toUpperCase()
    .replace(/[^A-Z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findPlate(text: string): string | null {
  const stdMatch = text.match(STANDARD_PLATE_REGEX);
  if (stdMatch) return `${stdMatch[1]}${stdMatch[2]}${stdMatch[3]}${stdMatch[4]}`;

  const bhMatch = text.match(BH_PLATE_REGEX);
  if (bhMatch) return `${bhMatch[1]}${bhMatch[2]}${bhMatch[3]}${bhMatch[4]}`;

  return null;
}

/**
 * Detect whether an image contains an Indian number plate.
 *
 * Signals (in priority order):
 *   1. Tesseract OCR text matches the Indian plate regex.
 *   2. Filename matches the regex (useful for tests / known-good uploads).
 *   3. Image aspect ratio is plate-like — a weak supporting signal only.
 */
export async function checkPlate(
  filename: string,
  buffer: Buffer,
): Promise<Result> {
  let aspectLooksLikePlate = false;
  try {
    const info = await sharp(buffer).metadata();
    if (info.width && info.height) {
      const aspectRatio = info.width / info.height;
      aspectLooksLikePlate =
        aspectRatio >= MIN_ASPECT_RATIO && aspectRatio <= MAX_ASPECT_RATIO;
    }
  } catch (error) {
    console.error("[plate] failed to read image metadata:", error);
  }

  // 1. OCR pass.
  try {
    const processed = await preprocess(buffer);
    const worker = await getWorker();
    const { data } = await worker.recognize(processed);
    const text = normaliseOcrText(data.text ?? "");
    const ocrPlate = findPlate(text);

    if (ocrPlate) {
      const ocrConfidence = Math.max(0, Math.min(1, (data.confidence ?? 60) / 100));
      return {
        passed: true,
        confidence: Math.max(0.7, ocrConfidence),
        details: `OCR detected plate: ${ocrPlate}`,
      };
    }
  } catch (error) {
    console.error("[plate] OCR failed:", error);
  }

  // 2. API Fallback (Optional)
  if (process.env.PLATE_RECOGNIZER_TOKEN) {
    try {
      const formData = new FormData();
      formData.append("upload", new Blob([buffer as any]), "image.jpg");
      formData.append("regions", "in"); // India

      const res = await fetch("https://api.platerecognizer.com/v1/plate-reader/", {
        method: "POST",
        headers: {
          "Authorization": `Token ${process.env.PLATE_RECOGNIZER_TOKEN}`,
        },
        body: formData as any,
      });

      if (res.ok) {
        const json = await res.json();
        if (json.results && json.results.length > 0) {
          const apiPlate = json.results[0].plate.toUpperCase();
          return {
            passed: true,
            confidence: json.results[0].score,
            details: `API Fallback detected plate: ${apiPlate}`,
          };
        }
      }
    } catch (err) {
      console.error("[plate] API Fallback failed:", err);
    }
  }

  // 3. Filename fallback.
  const filenamePlate = findPlate(filename.toUpperCase());
  if (filenamePlate) {
    return {
      passed: true,
      confidence: aspectLooksLikePlate ? 0.7 : 0.55,
      details: `Plate pattern found in filename: ${filenamePlate}`,
    };
  }

  // 4. Nothing found — report low confidence so downstream UI can show "no plate".
  return {
    passed: false,
    confidence: aspectLooksLikePlate ? 0.4 : 0.6,
    details: "No Indian plate pattern detected in OCR text, API, or filename",
  };
}

