import { Router, Request, Response } from 'express';
import { getQuotaUsageToday } from '../services/youtube.ts';
import { getRepositories } from '../repositories/index.ts';
import { HealthResponse } from '../../shared/types.ts';

export const healthRouter = Router();

// GET /api/v1/health
healthRouter.get('/', async (req: Request, res: Response) => {
  const repos = getRepositories();
  let dbStatus: 'ok' | 'error' = 'ok';

  try {
    // Quick probe
    await repos.users.getById('probe-test');
    dbStatus = 'ok';
  } catch (err) {
    dbStatus = 'error';
  }

  const secrets = {
    gemini: Boolean(process.env.GEMINI_API_KEY),
    youtube: Boolean(process.env.YOUTUBE_API_KEY),
    cloudNl: Boolean(process.env.CLOUD_NL_API_KEY),
  };

  const response: HealthResponse = {
    status: dbStatus === 'ok' ? 'ok' : 'degraded',
    database: dbStatus,
    secrets,
    youtubeQuotaUsedToday: getQuotaUsageToday(),
    appVersion: '1.0.0-phase1',
  };

  res.json(response);
});
