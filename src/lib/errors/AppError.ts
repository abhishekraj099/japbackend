export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public code?: string
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export const createError = (statusCode: number, message: string, code?: string) => {
  return new AppError(statusCode, message, code);
};
