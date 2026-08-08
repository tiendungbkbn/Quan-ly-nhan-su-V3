import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { ObjectStorageService } from "../lib/objectStorage";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

// Diagnostic endpoint — kiểm tra kết nối GCS trong production
router.get("/healthz/storage", async (_req, res): Promise<void> => {
  const svc = new ObjectStorageService();
  const result: Record<string, unknown> = {
    env: {
      PRIVATE_OBJECT_DIR: process.env.PRIVATE_OBJECT_DIR ? "✓ set" : "✗ missing",
      PUBLIC_OBJECT_SEARCH_PATHS: process.env.PUBLIC_OBJECT_SEARCH_PATHS ? "✓ set" : "✗ missing",
      DEFAULT_OBJECT_STORAGE_BUCKET_ID: process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID ? "✓ set" : "✗ missing",
      NODE_ENV: process.env.NODE_ENV,
    },
  };

  // Test sidecar reachability
  try {
    const r = await fetch("http://127.0.0.1:1106/credential", { signal: AbortSignal.timeout(3000) });
    result.sidecar = r.ok ? `✓ reachable (${r.status})` : `✗ status ${r.status}`;
  } catch (err: any) {
    result.sidecar = `✗ unreachable: ${err?.message ?? err}`;
  }

  // Test actual GCS upload with a tiny buffer
  try {
    const buf = Buffer.from("healthcheck");
    const objPath = await svc.uploadObjectEntityBuffer(buf, "text/plain");
    await svc.deleteObjectEntity(objPath);
    result.gcs_upload = "✓ upload + delete OK";
  } catch (err: any) {
    result.gcs_upload = `✗ failed: ${err?.message ?? err}`;
  }

  const allOk = String(result.gcs_upload).startsWith("✓") && String(result.sidecar).startsWith("✓");
  res.status(allOk ? 200 : 500).json(result);
});

export default router;
