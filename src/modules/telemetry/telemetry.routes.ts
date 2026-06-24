import { Router } from "express";
import * as telemetryController from "./telemetry.controller.js";
import { authenticate } from "../../middleware/authenticate.js";
import { aiLimiter } from "../../middleware/rateLimiter.js";

export const telemetryRoutes = Router();

// Authenticated + rate-limited ingest of pre-aggregated, PII-free counters.
telemetryRoutes.post("/", aiLimiter, authenticate, telemetryController.ingest);
// Dashboard metrics (operational visibility).
telemetryRoutes.get("/metrics", authenticate, telemetryController.metrics);

// Synthetic provider health checks (Phase 25I.3).
telemetryRoutes.post("/health", aiLimiter, authenticate, telemetryController.recordHealth);
telemetryRoutes.get("/health", authenticate, telemetryController.healthMetrics);
