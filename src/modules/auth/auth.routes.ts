import { Router } from "express";
import * as authController from "./auth.controller.js";
import { validate } from "../../middleware/validate.js";
import { authLimiter } from "../../middleware/rateLimiter.js";
import { registerSchema, loginSchema } from "./auth.schema.js";

export const authRoutes = Router();

authRoutes.post(
  "/register",
  authLimiter,
  validate(registerSchema),
  authController.register
);

authRoutes.post("/login", authLimiter, validate(loginSchema), authController.login);
