import { Router, type IRouter } from "express";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";

const router: IRouter = Router();
const storageService = new ObjectStorageService();

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
    const file = await storageService.getObjectEntityFile(objectPath);
    const [metadata] = await file.getMetadata();
    res.setHeader("Content-Type", (metadata.contentType as string) || "application/octet-stream");
    res.setHeader("Cache-Control", "private, max-age=86400");
    if (metadata.size) res.setHeader("Content-Length", String(metadata.size));
    const nodeStream = file.createReadStream();
    nodeStream.on("error", () => res.status(500).end());
    nodeStream.pipe(res);
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
    const file = await storageService.getPublicObjectFile(subPath);
    const [metadata] = await file.getMetadata();
    res.setHeader("Content-Type", (metadata.contentType as string) || "application/octet-stream");
    res.setHeader("Cache-Control", "public, max-age=86400");
    if (metadata.size) res.setHeader("Content-Length", String(metadata.size));
    const nodeStream = file.createReadStream();
    nodeStream.on("error", () => res.status(500).end());
    nodeStream.pipe(res);
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

// ─── Presigned URL để upload lên public folder ───────────────────────────────
router.post("/storage/public-uploads/request-url", async (req, res): Promise<void> => {
  const { folder, filename, contentType } = req.body as {
    folder?: string;
    filename?: string;
    contentType?: string;
  };

  if (!folder || !ALLOWED_FOLDERS.includes(folder as any)) {
    res.status(400).json({ error: `folder phải là một trong: ${ALLOWED_FOLDERS.join(", ")}` });
    return;
  }
  if (!filename || typeof filename !== "string") {
    res.status(400).json({ error: "Thiếu filename" });
    return;
  }

  // Sanitize filename
  const safeName = filename.replace(/[^a-zA-Z0-9._\-\u00C0-\u1EF9 ]/g, "_").trim();

  try {
    const result = await storageService.getPublicObjectUploadURL(
      folder,
      safeName,
      contentType || "application/octet-stream",
    );
    res.json({ ...result, servingUrl: `/api/storage${result.objectPath}` });
  } catch (err: any) {
    res.status(500).json({ error: "Không thể tạo upload URL", detail: err?.message });
  }
});

export default router;
