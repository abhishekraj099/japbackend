import { Router } from "express";
import { z } from "zod";
import * as cardController from "./card.controller.js";
import { authenticate } from "../../middleware/authenticate.js";
import { validate } from "../../middleware/validate.js";
import {
  createCardSchema,
  updateCardSchema,
  createGrammarCardSchema,
} from "./card.schema.js";

export const cardRoutes = Router();

cardRoutes.use(authenticate);

// Grammar-card routes — declared before "/:id" so the literal "grammar"
// segment is not captured as a card id.
cardRoutes.post("/grammar", validate(createGrammarCardSchema), cardController.createGrammar);
cardRoutes.get("/grammar/saved", cardController.getSavedGrammar);

cardRoutes.post("/", validate(createCardSchema), cardController.create);
cardRoutes.get("/deck/:deckId", cardController.getByDeck);
cardRoutes.get("/:id", validate(z.object({ id: z.string() }), "params"), cardController.getById);
cardRoutes.patch("/:id", validate(updateCardSchema), cardController.update);
cardRoutes.delete("/:id", cardController.remove);
