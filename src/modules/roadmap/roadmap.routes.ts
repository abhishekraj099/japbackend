import { Router } from "express";
import * as roadmapController from "./roadmap.controller.js";
import { authenticate } from "../../middleware/authenticate.js";

export const roadmapRoutes = Router();

// Personalized learning roadmap (Phase 43) — read-only.
roadmapRoutes.get("/", authenticate, roadmapController.getRoadmap);
