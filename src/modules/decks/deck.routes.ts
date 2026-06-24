import { Router } from "express";
import { z } from "zod";
import * as deckController from "./deck.controller.js";
import { authenticate } from "../../middleware/authenticate.js";
import { validate } from "../../middleware/validate.js";
import { createDeckSchema, updateDeckSchema } from "./deck.schema.js";

export const deckRoutes = Router();

deckRoutes.use(authenticate);

deckRoutes.post("/", validate(createDeckSchema), deckController.create);
deckRoutes.get("/", deckController.getAll);
deckRoutes.get("/:id", validate(z.object({ id: z.string() }), "params"), deckController.getById);
// Deck Intelligence (Phase 51) — read-only health/difficulty/forecast.
deckRoutes.get("/:id/intelligence", deckController.getIntelligence);
deckRoutes.patch("/:id", validate(updateDeckSchema), deckController.update);
deckRoutes.delete("/:id", deckController.remove);
