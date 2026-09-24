---
name: HRM database environments
description: Non-obvious relationship between the app runtime connection and Replit database panes.
---

The HRM API uses `DATABASE_URL` for development and `EXTERNAL_DATABASE_URL` for production. The external PostgreSQL database now contains the migrated production dataset; Replit's managed development database remains separate.

**Why:** The Replit-managed production database was subject to the Free-plan suspension warning, while the managed development database was empty. Production was migrated to the external PostgreSQL database to remove that dependency.

**How to apply:** Keep the production-only selection in `lib/db/src/index.ts`. Do not seed, migrate, or run destructive operations against either database without confirming the target and taking a backup.