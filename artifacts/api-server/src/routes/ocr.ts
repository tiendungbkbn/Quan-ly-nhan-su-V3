import { Router, type IRouter } from "express";
import multer from "multer";
import { OcrPassportResponse } from "@workspace/api-zod";
import os from "os";
import path from "path";
import fs from "fs";

// Use memory storage — OCR images are processed and discarded immediately,
// no need to persist to disk or object storage.
const ocrUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

const router: IRouter = Router();

// Simple regex-based OCR extraction from raw text
function extractPassportData(rawText: string): {
  fullName: string | null;
  passportNo: string | null;
  passportExpiry: string | null;
  dob: string | null;
} {
  const lines = rawText.split(/\n/).map((l) => l.trim()).filter(Boolean);

  let fullName: string | null = null;
  let passportNo: string | null = null;
  let passportExpiry: string | null = null;
  let dob: string | null = null;

  // MRZ line detection (machine readable zone)
  const mrzLines = lines.filter((l) => /^[A-Z0-9<]{30,}$/.test(l));

  if (mrzLines.length >= 2) {
    const line1 = mrzLines[0];
    const line2 = mrzLines[1];

    const nameMatch = line1.match(/^P<[A-Z]{3}([A-Z<]+)$/);
    if (nameMatch) {
      const rawName = nameMatch[1].replace(/<+/g, " ").trim();
      fullName = rawName;
    }

    if (line2.length >= 9) {
      passportNo = line2.substring(0, 9).replace(/</g, "");
    }

    if (line2.length >= 19) {
      const dobRaw = line2.substring(13, 19);
      if (/^\d{6}$/.test(dobRaw)) {
        const yy = parseInt(dobRaw.substring(0, 2));
        const mm = dobRaw.substring(2, 4);
        const dd = dobRaw.substring(4, 6);
        const year = yy > 30 ? 1900 + yy : 2000 + yy;
        dob = `${year}-${mm}-${dd}`;
      }
    }

    if (line2.length >= 27) {
      const expRaw = line2.substring(21, 27);
      if (/^\d{6}$/.test(expRaw)) {
        const yy = parseInt(expRaw.substring(0, 2));
        const mm = expRaw.substring(2, 4);
        const dd = expRaw.substring(4, 6);
        const year = yy > 30 ? 1900 + yy : 2000 + yy;
        passportExpiry = `${year}-${mm}-${dd}`;
      }
    }
  }

  if (!passportNo) {
    const pMatch = rawText.match(/(?:passport\s*(?:no|number|num)?\.?\s*[:：]?\s*)([A-Z]\d{7,8})/i);
    if (pMatch) passportNo = pMatch[1];
  }

  const dateMatches = rawText.match(/(\d{2}[\/\-.]\d{2}[\/\-.]\d{4}|\d{4}[\/\-.]\d{2}[\/\-.]\d{2})/g);
  if (dateMatches && dateMatches.length > 0 && !passportExpiry) {
    const d = dateMatches[dateMatches.length - 1];
    const parts = d.split(/[\/\-.]/);
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        passportExpiry = `${parts[0]}-${parts[1]}-${parts[2]}`;
      } else {
        passportExpiry = `${parts[2]}-${parts[1]}-${parts[0]}`;
      }
    }
  }

  return { fullName, passportNo, passportExpiry, dob };
}

router.post("/ocr", ocrUpload.single("image"), async (req, res): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: "Thiếu file ảnh" });
    return;
  }

  // Write buffer to a temp file so tesseract.js can read it (it needs a file path)
  const tmpPath = path.join(os.tmpdir(), `ocr-${Date.now()}.tmp`);
  try {
    fs.writeFileSync(tmpPath, req.file.buffer);

    let rawText = "";
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tesseract = await import("tesseract.js" as any);
      const { createWorker } = tesseract;
      const worker = await createWorker("chi_sim+eng");
      const { data } = await worker.recognize(tmpPath);
      rawText = data.text;
      await worker.terminate();
    } catch {
      rawText = "";
    }

    const extracted = extractPassportData(rawText);

    res.json(OcrPassportResponse.parse({
      ...extracted,
      rawText,
    }));
  } finally {
    // Always clean up the temp file
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
  }
});

export default router;
