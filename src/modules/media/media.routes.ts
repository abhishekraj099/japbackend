import { Router } from "express";
import * as mediaController from "./media.controller.js";
import { authenticate } from "../../middleware/authenticate.js";
import { aiLimiter } from "../../middleware/rateLimiter.js";

export const mediaRoutes = Router();

// Upload a card screenshot/audio to object storage; returns a public URL.
mediaRoutes.post("/upload", aiLimiter, authenticate, mediaController.upload);
