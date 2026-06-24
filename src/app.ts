import express, { Request, Response, Router } from "express";
import cors from "cors";
import { env } from "./config/env.js";
import logger from "./config/logger.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { AppError } from "./lib/errors/AppError.js";
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
import { analyticsRoutes } from "./modules/analytics/analytics.routes.js";
import { coverageRoutes } from "./modules/coverage/coverage.routes.js";

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

  // Single source-of-truth API router. Mounted at the unversioned `/api`
  // (legacy, backward compatible) AND `/api/v1` (frozen contract — Phase 28.3).
  // Adding a future `/api/v2` is one more mount of a separate router; v1 stays
  // unchanged.
  const apiRouter = (): Router => {
    const r = Router();
    r.use("/auth", authRoutes);
    r.use("/users", userRoutes);
    r.use("/decks", deckRoutes);
    r.use("/cards", cardRoutes);
    r.use("/reviews", reviewRoutes);
    r.use("/dictionary", dictionaryRoutes);
    r.use("/integrations", integrationRoutes);
    r.use("/sync", syncRoutes);
    r.use("/telemetry", telemetryRoutes);
    r.use("/media", mediaRoutes);
    r.use("/analytics", analyticsRoutes);
    r.use("/coverage", coverageRoutes);
    return r;
  };

  const v1 = apiRouter();
  app.use("/api/v1", v1); // frozen versioned contract
  app.use("/api", v1); // legacy alias → identical behavior
  // Future: app.use("/api/v2", apiRouterV2());

  app.use((req: Request, _res: Response, next) => {
    next(new AppError(404, "Not found", "NOT_FOUND"));
  });

  app.use(errorHandler);

  logger.info("Express app initialized", { env: env.NODE_ENV });

  return app;
};
