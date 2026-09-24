---
name: HRM App Storage
description: Persistent App Storage behavior and the supported client path for this project.
---

Use the official `@replit/object-storage` JavaScript SDK for application-managed uploads, downloads, listing, and deletes. Keep only object paths in PostgreSQL; do not fall back to local disk for files that must survive publish.

**Why:** The older sidecar signed-URL route returned 401 in the project workflow, while direct GCS writes from the deployment service account lacked object-create/list permission. The official SDK resolves the project bucket through Replit and passed upload, download, list, and delete checks.

**How to apply:** For future persistent file features, use `Client` with the configured App Storage bucket and normalize private objects under the private directory or public objects under the configured public search path.