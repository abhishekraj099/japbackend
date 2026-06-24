import { Router } from "express";
import * as achievementController from "./achievement.controller.js";
import { authenticate } from "../../middleware/authenticate.js";

export const achievementRoutes = Router();

// Derived achievements / milestones (Phase 42) — read-only.
achievementRoutes.get("/", authenticate, achievementController.getAchievements);
