import rateLimit from "express-rate-limit";

export const createRateLimiter = (windowMs: number, max: number) => {
  return rateLimit({
    windowMs,
    max,
    message: "Too many requests, please try again later.",
    standardHeaders: true,
    legacyHeaders: false,
  });
};

export const authLimiter = createRateLimiter(15 * 60 * 1000, 5);
export const apiLimiter = createRateLimiter(15 * 60 * 1000, 100);
