import { Router } from "express";
import * as reviewController from "./review.controller.js";
import { authenticate } from "../../middleware/authenticate.js";
import { validate } from "../../middleware/validate.js";
import { submitReviewSchema, batchReviewSchema } from "./review.schema.js";

export const reviewRoutes = Router();

reviewRoutes.use(authenticate);

reviewRoutes.get("/", reviewController.getReviews);
reviewRoutes.get("/due", reviewController.getDueCards);
// Focus Review Sessions (Phase 40) — weakness-targeted card selection.
reviewRoutes.get("/focus", reviewController.getFocusCards);
reviewRoutes.get("/stats", reviewController.getStats);
reviewRoutes.post("/submit", validate(submitReviewSchema), reviewController.submitReview);
reviewRoutes.post("/batch", validate(batchReviewSchema), reviewController.submitBatch);
