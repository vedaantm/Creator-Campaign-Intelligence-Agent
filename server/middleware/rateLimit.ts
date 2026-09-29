import { Request, Response, NextFunction } from 'express';
import { CONFIG } from '../../shared/config.ts';
import { AppError } from '../errors/AppError.ts';

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const userBuckets = new Map<string, RateLimitBucket>();

export function rateLimiter(req: Request, res: Response, next: NextFunction) {
  // Only apply rate limiting to API routes (/api/v1/*)
  // Static assets, platform tooling, preview iframe assets (_aistudio-iframe.js), and health/demo endpoints are excluded.
  const path = req.baseUrl ? `${req.baseUrl}${req.path}` : (req.originalUrl || req.url || req.path || '');
  if (
    !path.startsWith('/api/v1') ||
    path.startsWith('/api/v1/health') ||
    path.startsWith('/api/v1/demo') ||
    path.includes('/jobs')
  ) {
    return next();
  }

  // Identify user or fallback to IP / anonymous
  const forwarded = req.headers['x-forwarded-for'];
  const ip = (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : '') || req.ip || 'anonymous';
  const key = req.user?.uid || ip;
  const now = Date.now();

  let bucket = userBuckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    bucket = { count: 0, resetAt: now + CONFIG.RATE_LIMIT_WINDOW_MS };
    userBuckets.set(key, bucket);
  }

  bucket.count++;

  res.setHeader('X-RateLimit-Limit', CONFIG.RATE_LIMIT_MAX_REQUESTS);
  res.setHeader('X-RateLimit-Remaining', Math.max(0, CONFIG.RATE_LIMIT_MAX_REQUESTS - bucket.count));
  res.setHeader('X-RateLimit-Reset', Math.ceil(bucket.resetAt / 1000));

  if (bucket.count > CONFIG.RATE_LIMIT_MAX_REQUESTS) {
    return next(AppError.rateLimited('You have exceeded the request limit. Please wait a moment and try again.'));
  }

  next();
}
