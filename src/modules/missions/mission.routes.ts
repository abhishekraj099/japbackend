import { Router } from "express";
import * as missionController from "./mission.controller.js";
import { authenticate } from "../../middleware/authenticate.js";

export const missionRoutes = Router();

// Personalized daily study missions (Phase 41) — read-only, rule-based.
missionRoutes.get("/today", authenticate, missionController.getToday);
