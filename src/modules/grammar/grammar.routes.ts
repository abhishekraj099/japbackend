import { Router } from "express";
import * as grammarController from "./grammar.controller.js";
import { authenticate } from "../../middleware/authenticate.js";

export const grammarRoutes = Router();

// Grammar Mastery System (Phase 44) — read-only analytics over the dataset.
grammarRoutes.get("/mastery", authenticate, grammarController.getMastery);
