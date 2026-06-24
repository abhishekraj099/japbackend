import { Router } from "express";
import * as dictionaryController from "./dictionary.controller.js";
import { authenticate } from "../../middleware/authenticate.js";
import { aiLimiter } from "../../middleware/rateLimiter.js";

export const dictionaryRoutes = Router();

// Public reference data — no authentication required.
dictionaryRoutes.get("/search", dictionaryController.search);
// AI endpoints (Phase 26B): authenticated + rate-limited + quota-enforced.
dictionaryRoutes.get("/ai", aiLimiter, authenticate, dictionaryController.aiSearch);
dictionaryRoutes.get("/ai-sentence", aiLimiter, authenticate, dictionaryController.aiSentenceSearch);
