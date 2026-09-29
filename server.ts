import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { requestIdMiddleware } from './server/middleware/requestId.ts';
import { rateLimiter } from './server/middleware/rateLimit.ts';
import { authMiddleware } from './server/middleware/auth.ts';
import { errorHandler } from './server/middleware/error.ts';
import { campaignRouter } from './server/routes/campaigns.ts';
import { jobRouter } from './server/routes/jobs.ts';
import { healthRouter } from './server/routes/health.ts';
import { getRepositories } from './server/repositories/index.ts';
import { DEMO_CAMPAIGN, DEMO_CREATORS } from './server/fixtures/demoData.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize repositories on startup
const repos = getRepositories();

// Global middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(requestIdMiddleware);

// Health check (Public, no auth, no rate-limit)
app.use('/api/v1/health', healthRouter);

// Public Demo Endpoints (No authentication required)
app.get('/api/v1/demo/campaign', async (req, res) => {
  try {
    const seeded = await repos.campaigns.getById('cmp_demo_cci');
    if (seeded) {
      return res.json(seeded);
    }
  } catch (err) {
    console.warn('[Demo API] Error reading seeded campaign:', err);
  }
  return res.json(DEMO_CAMPAIGN);
});

app.get('/api/v1/demo/campaign/creators', async (req, res) => {
  try {
    const creators = await repos.creators.list('cmp_demo_cci');
    if (creators && creators.length > 0) {
      return res.json(creators);
    }
  } catch (err) {
    console.warn('[Demo API] Error reading creators:', err);
  }
  return res.json(DEMO_CREATORS);
});

app.get('/api/v1/demo/campaign/activity', async (req, res) => {
  try {
    const activity = await repos.activity.listByCampaign('cmp_demo_cci');
    if (activity && activity.items.length > 0) {
      return res.json(activity);
    }
  } catch (err) {
    console.warn('[Demo API] Error reading activity:', err);
  }
  return res.json({ items: [], total: 0 });
});

// API Routes with Rate Limiting & Auth
const apiRouter = express.Router();
apiRouter.use(rateLimiter);
apiRouter.use(authMiddleware);

apiRouter.use('/campaigns', campaignRouter);
apiRouter.use('/jobs', jobRouter);

// Mount API router
app.use('/api/v1', apiRouter);

// Central Error Handler for API
app.use('/api', errorHandler);

// Serve static frontend assets in production / preview
const distPath = fs.existsSync(path.resolve(process.cwd(), 'dist'))
  ? path.resolve(process.cwd(), 'dist')
  : path.resolve(__dirname, 'dist');

if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
}

// For all non-API routes, send index.html (SPA client-side routing)
app.get('*', (req, res) => {
  const indexHtml = path.resolve(distPath, 'index.html');
  if (fs.existsSync(indexHtml)) {
    res.sendFile(indexHtml);
  } else {
    res.status(200).send('<!DOCTYPE html><html><head><title>CCIA</title></head><body><div id="root">CCIA App Running</div></body></html>');
  }
});

// Start Server
if (process.env.NODE_ENV !== 'test') {
  const port = Number(process.env.PORT) || 3000;
  const host = '0.0.0.0';
  app.listen(port, host, () => {
    console.log(`[Server] CCIA backend listening on http://${host}:${port}`);
    console.log(`[Server] Repositories active: ${repos.isDemoOrMemory ? 'In-Memory / Demo' : 'Google Cloud Firestore'}`);
  });
}

export default app;
