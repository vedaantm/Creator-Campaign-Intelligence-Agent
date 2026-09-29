import { Router, Request, Response, NextFunction } from 'express';
import {
  GenerateSearchPackInputSchema,
  PatchSearchPackInputSchema,
  SearchPack,
} from '../../shared/types.ts';
import { getRepositories } from '../repositories/index.ts';
import { requireCampaignAccess } from '../middleware/campaignAuth.ts';
import { AppError } from '../errors/AppError.ts';
import { globalJobRunner } from '../jobs/runner.ts';

export const searchPackRouter = Router({ mergeParams: true });

// GET /api/v1/campaigns/:id/search-pack - Get search pack for campaign
searchPackRouter.get('/', requireCampaignAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const campaignId = req.params.id;
    const repos = getRepositories();
    const searchPack = await repos.searchPack.get(campaignId);

    if (!searchPack) {
      throw AppError.notFound(`Search pack for campaign ${campaignId} not found`);
    }

    res.json(searchPack);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/campaigns/:id/search-pack - Update search pack content or status
searchPackRouter.patch('/', requireCampaignAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const campaignId = req.params.id;
    const parseResult = PatchSearchPackInputSchema.safeParse(req.body);

    if (!parseResult.success) {
      const details = parseResult.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));
      throw AppError.validation('Invalid search pack update data', details);
    }

    const { content, status, version } = parseResult.data;
    const repos = getRepositories();

    const updated = await repos.searchPack.update(campaignId, version, {
      content,
      ...(status ? { status } : {}),
    });

    await repos.activity.log({
      campaignId,
      actorEmail: req.user?.email || 'user',
      action: 'UPDATE_SEARCH_PACK',
      entityType: 'search_pack',
      entityId: updated.id,
      summary: `Updated search pack (v${updated.version})`,
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/campaigns/:id/search-pack - Delete search pack
searchPackRouter.delete('/', requireCampaignAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const campaignId = req.params.id;
    const repos = getRepositories();

    await repos.searchPack.delete(campaignId);

    await repos.activity.log({
      campaignId,
      actorEmail: req.user?.email || 'user',
      action: 'DELETE_SEARCH_PACK',
      entityType: 'search_pack',
      entityId: 'search_pack',
      summary: 'Deleted search pack',
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/campaigns/:id/search-pack/generate - Launch background job for search pack generation
searchPackRouter.post('/generate', requireCampaignAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const campaignId = req.params.id;
    const parseResult = GenerateSearchPackInputSchema.safeParse(req.body || {});

    if (!parseResult.success) {
      const details = parseResult.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));
      throw AppError.validation('Invalid generation options', details);
    }

    const { force, instruction } = parseResult.data;
    const repos = getRepositories();

    // Check if existing search pack is final and force is false
    if (!force) {
      const existing = await repos.searchPack.get(campaignId);
      if (existing && existing.status === 'final') {
        throw AppError.unprocessable('Search pack is marked as final. Pass force: true to regenerate.');
      }
    }

    const job = await globalJobRunner.createJob(
      'GENERATE_SEARCH_PACK',
      campaignId,
      req.user?.uid || 'user',
      async (ctx) => {
        await ctx.updateProgress(10, 100, 'Initializing search query generation engine...');

        // Will be populated in Section B engine implementation
        const now = new Date().toISOString();
        const placeholderPack: SearchPack = {
          id: `sp_${Date.now()}`,
          campaignId,
          status: 'draft',
          content: {
            highIntentQueries: [],
            titleFormulas: [],
            thumbnailHooks: [],
            searchDescriptionTemplate: '',
            recommendedTags: [],
            creatorGuidelines: instruction || '',
          },
          generatedAt: now,
          updatedAt: now,
          version: 1,
        };

        await ctx.updateProgress(90, 100, 'Saving search pack...');
        const saved = await repos.searchPack.upsert(campaignId, placeholderPack);

        await repos.activity.log({
          campaignId,
          actorEmail: req.user?.email || 'user',
          action: 'GENERATE_SEARCH_PACK',
          entityType: 'search_pack',
          entityId: saved.id,
          summary: 'Generated campaign search pack',
        });

        await ctx.updateProgress(100, 100, 'Search pack generated successfully.');
        return saved;
      }
    );

    res.status(202).json({ jobId: job.id, status: job.status });
  } catch (err) {
    next(err);
  }
});
