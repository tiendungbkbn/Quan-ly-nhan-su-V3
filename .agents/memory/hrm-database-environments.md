---
name: HRM database environments
description: Non-obvious relationship between the app runtime connection and Replit database panes.
---

The HRM API connects through `DATABASE_URL`, and the current runtime-managed value returns the populated production dataset. Replit's managed development database is a separate database and is currently empty.

**Why:** A local API request returned the production employee/document/template counts even though the development database pane had zero rows. This means local workflow mutations can affect production data when using the current runtime connection.

**How to apply:** Treat the local API workflow as production-data-connected unless the environment is explicitly changed. Do not run seed, migration, or destructive data operations from the local workflow without confirming the target first.