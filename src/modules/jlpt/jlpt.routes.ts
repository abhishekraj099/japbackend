import { Router } from "express";
import * as jlptController from "./jlpt.controller.js";
import { authenticate } from "../../middleware/authenticate.js";

export const jlptRoutes = Router();

// JLPT Preparation Center (Phase 45) — read-only aggregation.
jlptRoutes.get("/", authenticate, jlptController.getOverview);
