import { ErrorCode } from '../../shared/types.ts';

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown> | Array<{ field: string; message: string }>;
  public readonly retryable: boolean;

  constructor(
    code: ErrorCode,
    message: string,
    statusCode = 400,
    details?: Record<string, unknown> | Array<{ field: string; message: string }>,
    retryable = false
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.retryable = retryable;
    Object.setPrototypeOf(this, AppError.prototype);
  }

  static validation(message: string, details?: Array<{ field: string; message: string }>): AppError {
    return new AppError('VALIDATION_ERROR', message, 400, details, false);
  }

  static unauthenticated(message = 'Authentication required'): AppError {
    return new AppError('UNAUTHENTICATED', message, 401, undefined, false);
  }

  static forbidden(message = 'You do not have permission to perform this action'): AppError {
    return new AppError('FORBIDDEN', message, 403, undefined, false);
  }

  static notFound(message = 'Resource not found'): AppError {
    return new AppError('NOT_FOUND', message, 404, undefined, false);
  }

  static conflict(message: string, currentData?: Record<string, unknown>): AppError {
    return new AppError('CONFLICT', message, 409, currentData, false);
  }

  static unprocessable(message: string): AppError {
    return new AppError('UNPROCESSABLE', message, 422, undefined, false);
  }

  static rateLimited(message = 'Too many requests, please slow down'): AppError {
    return new AppError('RATE_LIMITED', message, 429, undefined, true);
  }

  static internal(message = 'Internal server error'): AppError {
    return new AppError('INTERNAL', message, 500, undefined, false);
  }

  static upstream(message = 'Upstream service error', retryable = true): AppError {
    return new AppError('UPSTREAM_ERROR', message, 502, undefined, retryable);
  }

  static aiInvalidOutput(message: string, details?: Record<string, unknown>): AppError {
    return new AppError('AI_INVALID_OUTPUT', message, 422, details, false);
  }

  static aiRateLimited(message = 'AI rate limit exceeded, retry later'): AppError {
    return new AppError('AI_RATE_LIMITED', message, 429, undefined, true);
  }

  static aiUnavailable(message = 'AI service unavailable'): AppError {
    return new AppError('AI_UNAVAILABLE', message, 503, undefined, true);
  }

  static quotaExceeded(message = 'YouTube API quota threshold exceeded'): AppError {
    return new AppError('QUOTA_EXCEEDED', message, 429, undefined, false);
  }

  static channelNotFound(message = 'YouTube channel not found'): AppError {
    return new AppError('CHANNEL_NOT_FOUND', message, 404, undefined, false);
  }

  static apiKeyInvalid(message = 'YouTube API key is invalid'): AppError {
    return new AppError('API_KEY_INVALID', message, 401, undefined, false);
  }
}
