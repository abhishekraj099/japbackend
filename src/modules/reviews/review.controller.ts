import { Request, Response, NextFunction } from "express";
import { ReviewService } from "./review.service.js";
import { SubmitReviewInput, BatchReviewInput } from "./review.schema.js";

const reviewService = new ReviewService();

export const getReviews = async (
  req: Request<{}, {}, {}, { page?: string; limit?: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const page = req.query.page ? parseInt(req.query.page, 10) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 50;
    const result = await reviewService.getReviewsForUser(req.user!.id, page, limit);
    res.json(result);
  } catch (error) {
    next(error);
  }
};

export const submitBatch = async (
  req: Request<{}, {}, BatchReviewInput>,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await reviewService.submitBatch(req.user!.id, req.body);
    res.json(result);
  } catch (error) {
    next(error);
  }
};

export const getStats = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const stats = await reviewService.getStats(req.user!.id);
    res.json(stats);
  } catch (error) {
    next(error);
  }
};

export const getDueCards = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
    const cards = await reviewService.getDueCards(req.user!.id, limit);
    res.json(cards);
  } catch (error) {
    next(error);
  }
};

/** Focus Review Sessions (Phase 40) — targeted, weakness-ordered cards. */
export const getFocusCards = async (
  req: Request<{}, {}, {}, { type?: string; jlpt?: string; band?: string; limit?: string; exclude?: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const cards = await reviewService.getFocusCards(req.user!.id, {
      type: req.query.type ?? "top-failures",
      jlpt: req.query.jlpt,
      band: req.query.band,
      limit: req.query.limit ? parseInt(req.query.limit) : 20,
      exclude: req.query.exclude ? req.query.exclude.split(",").filter(Boolean) : undefined,
    });
    res.json(cards);
  } catch (error) {
    next(error);
  }
};

export const submitReview = async (
  req: Request<{}, {}, SubmitReviewInput>,
  res: Response,
  next: NextFunction
) => {
  try {
    const review = await reviewService.submitReview(req.user!.id, req.body);
    res.status(201).json(review);
  } catch (error) {
    next(error);
  }
};
