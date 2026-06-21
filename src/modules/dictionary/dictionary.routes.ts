import { Router } from "express";
import * as dictionaryController from "./dictionary.controller.js";

export const dictionaryRoutes = Router();

// Public reference data — no authentication required.
dictionaryRoutes.get("/search", dictionaryController.search);
// AI fallback lookup (Phase 18A) — used when /search has no result.
dictionaryRoutes.get("/ai", dictionaryController.aiSearch);
