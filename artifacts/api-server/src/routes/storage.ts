import { Router, type IRouter } from "express";
import multer from "multer";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";

const router: IRouter = Router();
const storageService = new ObjectStorageService();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

const ALLOWED_FOLDERS = ["photos", "templates"] as const;

/** Express 5 wildcard params can be arrays when the path has multiple segments. */
function joinParam(raw: unknown): string {
  if (Array.isArray(raw)) return raw.join('/');
  return String(raw ?? '');
}

// ─── Serve private object entities ───────────────────────────────────────────
router.get("/storage/objects/*path", async (req, res): Promise<void> => {
  const objectPath = `/objects/${joinParam((req.params as any).path)}`;
  try {
    const buffer = await storageService.downloadObjectEntityBuffer(objectPath);
    res.setHeader("Content-Type", contentTypeForPath(objectPath));
    res.setHeader("Cache-Control", "private, max-age=86400");
    res.send(buffer);
  } catch (err) {
    if (err instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Object not found" });
    } else {
      res.status(500).json({ error: "Failed to retrieve object" });
    }
  }
});

// ─── Serve public objects ────────────────────────────────────────────────────
router.get("/storage/public-objects/*path", async (req, res): Promise<void> => {
  const subPath = joinParam((req.params as any).path);
  try {
    const buffer = await storageService.downloadPublicObjectBuffer(subPath);
    res.setHeader("Content-Type", contentTypeForPath(subPath));
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(buffer);
  } catch (err) {
    if (err instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Object not found" });
    } else {
      res.status(500).json({ error: "Failed to retrieve public object" });
    }
  }
});

// ─── List files in a public folder ──────────────────────────────────────────
router.get("/storage/list", async (req, res): Promise<void> => {
  const { folder } = req.query as { folder?: string };
  if (!folder || !ALLOWED_FOLDERS.includes(folder as any)) {
    res.status(400).json({ error: `folder phải là một trong: ${ALLOWED_FOLDERS.join(", ")}` });
    return;
  }
  try {
    const files = await storageService.listPublicObjects(folder);
    res.json({ folder, files });
  } catch (err: any) {
    res.status(500).json({ error: "Không thể liệt kê files", detail: err?.message });
  }
});

// ─── Upload trực tiếp vào public App Storage folder ─────────────────────────
router.post("/storage/public-uploads", upload.single("file"), async (req, res): Promise<void> => {
  const { folder, filename, contentType } = req.body as {
    folder?: string;
    filename?: string;
    contentType?: string;
  };

  if (!folder || !ALLOWED_FOLDERS.includes(folder as any)) {
    res.status(400).json({ error: `folder phải là một trong: ${ALLOWED_FOLDERS.join(", ")}` });
    return;
  }
  if (!req.file) {
    res.status(400).json({ error: "Thiếu file" });
    return;
  }
  if (!filename || typeof filename !== "string") {
    res.status(400).json({ error: "Thiếu filename" });
    return;
  }

  // Sanitize filename
  const safeName = filename.replace(/[^a-zA-Z0-9._\-\u00C0-\u1EF9 ]/g, "_").trim();

  try {
    const objectPath = await storageService.uploadPublicObjectBuffer(
      folder,
      safeName,
      req.file.buffer,
      contentType || "application/octet-stream",
    );
    res.json({
      objectPath,
      servingUrl: `/api/storage${objectPath}`,
      name: safeName,
      size: req.file.size,
      updatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({ error: "Không thể tải file lên App Storage", detail: err?.message });
  }
});

export default router;

function contentTypeForPath(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
}
