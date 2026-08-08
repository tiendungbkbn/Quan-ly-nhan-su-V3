import { Router } from "express";
import healthRouter from "./health";
import employeesRouter from "./employees";
import documentsRouter from "./documents";
import dashboardRouter from "./dashboard";
import templatesRouter from "./templates";
import ocrRouter from "./ocr";
import importRouter from "./import";
import exportRouter from "./export";
import storageRouter from "./storage";

const router = Router();

router.use(healthRouter);
router.use(storageRouter);
router.use(exportRouter);
router.use(employeesRouter);
router.use(documentsRouter);
router.use(dashboardRouter);
router.use(templatesRouter);
router.use(ocrRouter);
router.use(importRouter);

export default router;
