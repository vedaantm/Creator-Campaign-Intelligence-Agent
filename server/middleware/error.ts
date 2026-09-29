import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors/AppError.ts';
import { ApiErrorResponse } from '../../shared/types.ts';

export function errorHandler(
  err: Error | AppError | ZodError | (SyntaxError & { status?: number }),
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
) {
  const requestId = (req.headers['x-request-id'] as string) || (res.getHeader('x-request-id') as string);

  // Handle malformed JSON body parse errors (e.g. from express.json())
  if (err instanceof SyntaxError && 'status' in err && (err as { status?: number }).status === 400 && 'body' in err) {
    const response: ApiErrorResponse = {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Malformed JSON payload in request body',
        details: [{ field: 'body', message: err.message }],
        retryable: false,
        requestId,
      },
    };
    return res.status(400).json(response);
  }

  // Handle Zod Validation Errors
  if (err instanceof ZodError) {
    const details = err.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));
    const response: ApiErrorResponse = {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details,
        retryable: false,
        requestId,
      },
    };
    return res.status(400).json(response);
  }

  // Handle AppError instances
  if (err instanceof AppError) {
    const response: ApiErrorResponse = {
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
        retryable: err.retryable,
        requestId,
      },
    };
    return res.status(err.statusCode).json(response);
  }

  // Handle Unknown / Internal Errors (Redact details for security)
  console.error(`[Error] Request ${requestId} failed:`, err);
  const response: ApiErrorResponse = {
    error: {
      code: 'INTERNAL',
      message: 'An unexpected internal error occurred',
      retryable: false,
      requestId,
    },
  };
  return res.status(500).json(response);
}
