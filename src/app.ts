import express, { Request, Response } from "express";
import cors from "cors";
import { env } from "./config/env.js";
import logger from "./config/logger.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { apiLimiter } from "./middleware/rateLimiter.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { userRoutes } from "./modules/users/user.routes.js";
import { deckRoutes } from "./modules/decks/deck.routes.js";
import { cardRoutes } from "./modules/cards/card.routes.js";
import { reviewRoutes } from "./modules/reviews/review.routes.js";
import { dictionaryRoutes } from "./modules/dictionary/dictionary.routes.js";
import { integrationRoutes } from "./modules/integrations/integration.routes.js";
import { syncRoutes } from "./modules/sync/sync.routes.js";
import { telemetryRoutes } from "./modules/telemetry/telemetry.routes.js";
import { mediaRoutes } from "./modules/media/media.routes.js";

export const createApp = () => {
  const app = express();

  // Trust one proxy hop (PaaS/load balancer) so rate-limiting + req.ip use the
  // real client IP rather than the proxy's (Phase 25E fix).
  app.set("trust proxy", 1);

  const allowedOrigins = env.CORS_ORIGIN.split(",").map((o) => o.trim());
  app.use(cors({ origin: allowedOrigins }));
  // Card saves carry base64 image/audio data URLs (Phase 24/25D); the default
  // 100kb body limit rejected them with 413. Raise to cover capped media sizes.
  app.use(express.json({ limit: "6mb" }));
  app.use(apiLimiter);

  app.get("/health", (req: Request, res: Response) => {
    res.json({ status: "ok" });
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/users", userRoutes);
  app.use("/api/decks", deckRoutes);
  app.use("/api/cards", cardRoutes);
  app.use("/api/reviews", reviewRoutes);
  app.use("/api/dictionary", dictionaryRoutes);
  app.use("/api/integrations", integrationRoutes);
  app.use("/api/sync", syncRoutes);
  app.use("/api/telemetry", telemetryRoutes);
  app.use("/api/media", mediaRoutes);

  app.use((req: Request, res: Response) => {
    res.status(404).json({ error: "Not found" });
  });

  app.use(errorHandler);

  logger.info("Express app initialized", { env: env.NODE_ENV });

  return app;
};
