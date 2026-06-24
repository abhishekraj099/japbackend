import { Router } from "express";
import * as plannerController from "./planner.controller.js";
import { authenticate } from "../../middleware/authenticate.js";

export const plannerRoutes = Router();

// Study Planner & Daily Coach (Phase 53) — read-only daily plan.
plannerRoutes.get("/today", authenticate, plannerController.getToday);
