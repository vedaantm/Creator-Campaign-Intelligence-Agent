import express from 'express';
import cors from 'cors';
import { requestIdMiddleware } from './middleware/requestId.ts';
import { rateLimiter } from './middleware/rateLimit.ts';
import { authMiddleware } from './middleware/auth.ts';
import { errorHandler } from './middleware/error.ts';
import { campaignRouter } from './routes/campaigns.ts';
import { jobRouter } from './routes/jobs.ts';
import { healthRouter } from './routes/health.ts';
import { getRepositories } from './repositories/index.ts';
import { DEMO_CAMPAIGN, DEMO_CREATORS } from './fixtures/demoData.ts';

export function createApiApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));
  app.use(requestIdMiddleware);

  // Health
  app.use('/api/v1/health', healthRouter);

  // Public Demo Endpoints
  app.get('/api/v1/demo/campaign', async (req, res) => {
    try {
      const repos = getRepositories();
      const seeded = await repos.campaigns.getById('cmp_demo_cci');
      if (seeded) {
        return res.json(seeded);
      }
    } catch (err) {
      console.warn('[Demo API] Error reading seeded campaign:', err);
    }
    res.json(DEMO_CAMPAIGN);
  });

  app.get('/api/v1/demo/campaign/creators', async (req, res) => {
    try {
      const repos = getRepositories();
      const creators = await repos.creators.list('cmp_demo_cci');
      if (creators && creators.length > 0) {
        return res.json(creators);
      }
    } catch (err) {
      console.warn('[Demo API] Error reading creators:', err);
    }
    res.json(DEMO_CREATORS);
  });

  // Protected /api/v1
  const apiRouter = express.Router();
  apiRouter.use(rateLimiter);
  apiRouter.use(authMiddleware);
  apiRouter.use('/campaigns', campaignRouter);
  apiRouter.use('/jobs', jobRouter);

  app.use('/api/v1', apiRouter);
  app.use('/api', errorHandler);

  return app;
}
