import { Router, Request, Response, NextFunction } from 'express';
import { globalJobRunner } from '../jobs/runner.ts';
import { requireCampaignAccess } from '../middleware/campaignAuth.ts';
import { AppError } from '../errors/AppError.ts';

export const jobRouter = Router();

// GET /api/v1/jobs/:jobId - Get job details
jobRouter.get('/:jobId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const job = await globalJobRunner.getJob(req.params.jobId);
    // Ensure caller has access to the campaign of this job
    req.params.campaignId = job.campaignId;
    await new Promise<void>((resolve, reject) => {
      requireCampaignAccess(req, res, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });

    res.json(job);
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/jobs/:jobId/cancel - Request job cancellation
jobRouter.post('/:jobId/cancel', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const job = await globalJobRunner.getJob(req.params.jobId);
    req.params.campaignId = job.campaignId;
    await new Promise<void>((resolve, reject) => {
      requireCampaignAccess(req, res, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });

    const updated = await globalJobRunner.requestCancel(req.params.jobId);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});
