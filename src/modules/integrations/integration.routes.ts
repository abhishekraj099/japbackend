import { Router } from "express";
import * as integrationController from "./integration.controller.js";
import { authenticate } from "../../middleware/authenticate.js";

export const integrationRoutes = Router();

integrationRoutes.use(authenticate);

integrationRoutes.get("/", integrationController.getAll);
integrationRoutes.post("/anki/connect", integrationController.connectAnki);
integrationRoutes.post("/anki/disconnect", integrationController.disconnectAnki);
