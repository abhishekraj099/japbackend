import { Router } from "express";
import * as coverageController from "./coverage.controller.js";
import { authenticate } from "../../middleware/authenticate.js";

export const coverageRoutes = Router();

// Read-only learning-coverage estimate (Phase 35).
coverageRoutes.get("/", authenticate, coverageController.getCoverage);
