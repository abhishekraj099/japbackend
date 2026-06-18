import { Router } from "express";
import * as userController from "./user.controller.js";
import { authenticate } from "../../middleware/authenticate.js";
import { validate } from "../../middleware/validate.js";
import { updateUserSchema } from "./user.schema.js";

export const userRoutes = Router();

userRoutes.use(authenticate);

userRoutes.get("/profile", userController.getProfile);
userRoutes.patch("/profile", validate(updateUserSchema), userController.updateProfile);
userRoutes.delete("/account", userController.deleteAccount);
