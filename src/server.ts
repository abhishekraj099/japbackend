import { createApp } from "./app.js";
import { env } from "./config/env.js";
import logger from "./config/logger.js";

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info(`Server listening on port ${env.PORT}`, { env: env.NODE_ENV });
});

process.on("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down gracefully");
  server.close(() => {
    logger.info("Server closed");
    process.exit(0);
  });
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Rejection at:", { promise, reason });
  process.exit(1);
});

process.on("uncaughtException", (error) => {
  logger.error("Uncaught Exception:", error);
  process.exit(1);
});
