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

export const createApp = () => {
  const app = express();

  const allowedOrigins = env.CORS_ORIGIN.split(",").map((o) => o.trim());
  app.use(cors({ origin: allowedOrigins }));
  app.use(express.json());
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

  app.use((req: Request, res: Response) => {
    res.status(404).json({ error: "Not found" });
  });

  app.use(errorHandler);

  logger.info("Express app initialized", { env: env.NODE_ENV });

  return app;
};
