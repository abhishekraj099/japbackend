import { Router } from "express";
import * as authController from "./auth.controller.js";
import { validate } from "../../middleware/validate.js";
import { authLimiter } from "../../middleware/rateLimiter.js";
import { authenticate } from "../../middleware/authenticate.js";
import { registerSchema, loginSchema } from "./auth.schema.js";

export const authRoutes = Router();

authRoutes.post(
  "/register",
  authLimiter,
  validate(registerSchema),
  authController.register
);

authRoutes.post("/login", authLimiter, validate(loginSchema), authController.login);

// Token rotation + session management (Phase 28.1).
authRoutes.post("/refresh", authLimiter, authController.refresh);
authRoutes.post("/logout", authController.logout);
authRoutes.post("/logout-all", authenticate, authController.logoutAll);
