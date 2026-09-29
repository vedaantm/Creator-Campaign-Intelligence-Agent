import { Router, Request, Response, NextFunction } from 'express';
import {
  CreatePremortemRunInputSchema,
  WhatIfInputSchema,
} from '../../shared/types.ts';
import { getRepositories } from '../repositories/index.ts';
import { requireCampaignAccess } from '../middleware/campaignAuth.ts';
import { globalJobRunner } from '../jobs/runner.ts';
import { executePremortem } from '../engines/premortem/premortemEngine.ts';
import { executeWhatIf } from '../engines/premortem/whatIf.ts';
import { AppError } from '../errors/AppError.ts';

export const premortemRouter = Router({ mergeParams: true });

// GET /api/v1/campaigns/:id/premortem/runs - List runs for campaign (newest first)
premortemRouter.get('/runs', requireCampaignAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repos = getRepositories();
    const runs = await repos.premortem.list(req.params.id);
    res.json(runs);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/campaigns/:id/premortem/runs/:runId - Get single run
premortemRouter.get('/runs/:runId', requireCampaignAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repos = getRepositories();
    const run = await repos.premortem.getById(req.params.id, req.params.runId);
    if (!run) {
      throw AppError.notFound(`Pre-Mortem run ${req.params.runId} not found`);
    }
    res.json(run);
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/campaigns/:id/premortem/runs - Start Pre-Mortem simulation job
premortemRouter.post('/runs', requireCampaignAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { creatorIds } = CreatePremortemRunInputSchema.parse(req.body);
    const campaignId = req.params.id;
    const repos = getRepositories();

    // Verify creator IDs belong to this campaign and are analyzed
    const creators = await repos.creators.list(campaignId);
    const creatorMap = new Map(creators.map((c) => [c.id, c]));

    for (const id of creatorIds) {
      const c = creatorMap.get(id);
      if (!c) {
        throw AppError.validation(`Creator ID ${id} not found in this campaign`);
      }
      if (c.status !== 'analyzed') {
        throw AppError.validation(`Creator "${c.channel?.title || c.normalizedKey}" is not analyzed yet. Run discovery first.`);
      }
    }

    const job = await globalJobRunner.createJob(
      'PREMORTEM',
      campaignId,
      req.user!.uid,
      async (ctx) => {
        return await executePremortem(campaignId, creatorIds, {
          updateProgress: ctx.updateProgress,
          isCancelled: ctx.isCancelled,
          userId: req.user!.email,
        });
      }
    );

    res.status(202).json({
      jobId: job.id,
      status: job.status,
      message: 'Pre-Mortem simulation started',
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/campaigns/:id/premortem/runs/:runId - Delete run (cannot delete approved run)
premortemRouter.delete('/runs/:runId', requireCampaignAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repos = getRepositories();
    const run = await repos.premortem.getById(req.params.id, req.params.runId);
    if (!run) {
      throw AppError.notFound(`Pre-Mortem run ${req.params.runId} not found`);
    }

    if (run.approved) {
      throw AppError.validation('Cannot delete an approved Pre-Mortem run. Approve a different run first or keep it as the baseline commercial audit.');
    }

    await repos.premortem.delete(req.params.id, req.params.runId);

    await repos.activity.log({
      campaignId: req.params.id,
      actorEmail: req.user!.email,
      action: 'PREMORTEM_RUN_DELETED',
      entityType: 'premortemRun',
      entityId: req.params.runId,
      summary: `Deleted Pre-Mortem run (Health: ${run.healthScore})`,
    });

    res.json({ message: 'Pre-Mortem run deleted', runId: req.params.runId });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/campaigns/:id/premortem/what-if - Synchronous what-if simulation (no AI)
premortemRouter.post('/what-if', requireCampaignAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { creatorIds } = WhatIfInputSchema.parse(req.body);
    const result = await executeWhatIf(req.params.id, creatorIds);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/campaigns/:id/premortem/runs/:runId/approve - Approve lineup
premortemRouter.post('/runs/:runId/approve', requireCampaignAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repos = getRepositories();
    const campaignId = req.params.id;
    const runId = req.params.runId;

    const run = await repos.premortem.getById(campaignId, runId);
    if (!run) {
      throw AppError.notFound(`Pre-Mortem run ${runId} not found`);
    }

    // Mark run approved and all others not approved
    await repos.premortem.setApprovedRun(campaignId, runId);

    // Update campaign approvedLineup
    const campaign = req.campaign!;
    const approvedLineupData = {
      creatorIds: run.lineupCreatorIds,
      runId: run.id,
      approvedAt: new Date().toISOString(),
      approvedBy: req.user!.email,
    };

    const updatedCampaign = await repos.campaigns.update(campaignId, campaign.version, {
      approvedLineup: approvedLineupData,
    });

    // Sync 'selected' flag on creators
    const creators = await repos.creators.list(campaignId);
    const approvedSet = new Set(run.lineupCreatorIds);
    for (const c of creators) {
      const shouldSelect = approvedSet.has(c.id);
      if (c.selected !== shouldSelect) {
        await repos.creators.update(campaignId, c.id, c.version, { selected: shouldSelect });
      }
    }

    await repos.activity.log({
      campaignId,
      actorEmail: req.user!.email,
      action: 'LINEUP_APPROVED',
      entityType: 'campaign',
      entityId: campaignId,
      summary: `Approved creator lineup with Health Score ${run.healthScore}/100 (${run.lineupCreatorIds.length} creators)`,
    });

    res.json({
      success: true,
      approvedRunId: run.id,
      campaign: updatedCampaign,
    });
  } catch (err) {
    next(err);
  }
});
