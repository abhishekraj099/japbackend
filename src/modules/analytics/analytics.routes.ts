import { Router } from "express";
import * as analyticsController from "./analytics.controller.js";
import { authenticate } from "../../middleware/authenticate.js";

export const analyticsRoutes = Router();

// Read-only learner analytics dashboard (Phase 34). One aggregated call.
analyticsRoutes.get("/", authenticate, analyticsController.getDashboard);
// Weak Point Detection (Phase 39) — read-only review-history analysis.
analyticsRoutes.get("/weak-points", authenticate, analyticsController.getWeakPoints);
