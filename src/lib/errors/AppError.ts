export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public code?: string,
    public details?: unknown
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export const createError = (statusCode: number, message: string, code?: string, details?: unknown) => {
  return new AppError(statusCode, message, code, details);
};
