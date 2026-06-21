import { Router } from "express";
import * as syncController from "./sync.controller.js";
import { authenticate } from "../../middleware/authenticate.js";

export const syncRoutes = Router();

syncRoutes.use(authenticate);

syncRoutes.get("/", syncController.getChanges);
