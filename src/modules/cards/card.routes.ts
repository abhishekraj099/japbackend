import { Router } from "express";
import { z } from "zod";
import * as cardController from "./card.controller.js";
import { authenticate } from "../../middleware/authenticate.js";
import { validate } from "../../middleware/validate.js";
import {
  createCardSchema,
  updateCardSchema,
  createGrammarCardSchema,
  createSentenceCardSchema,
} from "./card.schema.js";

export const cardRoutes = Router();

cardRoutes.use(authenticate);

// Grammar-card routes — declared before "/:id" so the literal "grammar"
// segment is not captured as a card id.
cardRoutes.post("/grammar", validate(createGrammarCardSchema), cardController.createGrammar);
cardRoutes.get("/grammar/saved", cardController.getSavedGrammar);
// Grammar Library — full grammar cards + schedule, one bulk call (Phase 38).
cardRoutes.get("/grammar/library", cardController.getGrammarLibrary);
// Sentence-card route — literal "/sentence" before "/:id".
cardRoutes.post("/sentence", validate(createSentenceCardSchema), cardController.createSentence);
// Saved vocab words — literal "/saved" before "/:id" so it isn't read as an id.
cardRoutes.get("/saved", cardController.getSavedWords);
// Word-status (known/learning by maturity) for page coloring (Phase 23).
cardRoutes.get("/word-status", cardController.getWordStatus);

cardRoutes.post("/", validate(createCardSchema), cardController.create);
cardRoutes.get("/deck/:deckId", cardController.getByDeck);
cardRoutes.get("/:id", validate(z.object({ id: z.string() }), "params"), cardController.getById);
cardRoutes.patch("/:id", validate(updateCardSchema), cardController.update);
cardRoutes.delete("/:id", cardController.remove);
