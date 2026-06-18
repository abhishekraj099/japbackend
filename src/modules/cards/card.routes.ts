import { Router } from "express";
import { z } from "zod";
import * as cardController from "./card.controller.js";
import { authenticate } from "../../middleware/authenticate.js";
import { validate } from "../../middleware/validate.js";
import { createCardSchema, updateCardSchema } from "./card.schema.js";

export const cardRoutes = Router();

cardRoutes.use(authenticate);

cardRoutes.post("/", validate(createCardSchema), cardController.create);
cardRoutes.get("/deck/:deckId", cardController.getByDeck);
cardRoutes.get("/:id", validate(z.object({ id: z.string() }), "params"), cardController.getById);
cardRoutes.patch("/:id", validate(updateCardSchema), cardController.update);
cardRoutes.delete("/:id", cardController.remove);
