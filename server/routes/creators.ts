import { Router, Request, Response, NextFunction } from 'express';
import {
  AddCreatorInputSchema,
  BulkAddCreatorsInputSchema,
  UpdateCreatorInputSchema,
  CreatorQuerySchema,
  CampaignBriefSchema,
  Creator,
} from '../../shared/types.ts';
import { CONFIG } from '../../shared/config.ts';
import { getRepositories } from '../repositories/index.ts';
import { requireCampaignAccess } from '../middleware/campaignAuth.ts';
import { parseCreatorInput } from '../engines/discovery/inputParser.ts';
import { resolveChannel, checkQuotaAvailable, getQuotaUsageToday } from '../services/youtube.ts';
import { globalJobRunner } from '../jobs/runner.ts';
import { executeCampaignDiscovery, analyzeCreator, checkSingleCreatorBudgetFit } from '../engines/discovery/discoveryEngine.ts';
import { recomputeAllScores } from '../engines/discovery/scoring.ts';
import { AppError } from '../errors/AppError.ts';

export const creatorRouter = Router({ mergeParams: true });

// GET /api/v1/campaigns/:id/creators/quota/status - Get today's YouTube quota usage
creatorRouter.get('/quota/status', requireCampaignAccess, async (req: Request, res: Response) => {
  const used = getQuotaUsageToday();
  const limit = CONFIG.YOUTUBE_DAILY_QUOTA_UNITS;
  res.json({
    used,
    limit,
    threshold: Math.floor(limit * CONFIG.YOUTUBE_QUOTA_WARNING_RATIO),
    remaining: Math.max(0, limit - used),
  });
});

// POST /api/v1/campaigns/:id/creators/preview - Live channel preview for single creator input
creatorRouter.post('/preview', requireCampaignAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { input } = req.body;
    if (!input || typeof input !== 'string' || !input.trim()) {
      throw AppError.validation('Valid creator input is required');
    }

    const parsed = parseCreatorInput(input);
    if (!parsed.valid || !parsed.normalizedKey) {
      throw AppError.validation(parsed.error || 'Invalid format');
    }

    const repos = getRepositories();
    const existing = await repos.creators.findByNormalizedKey(req.params.id, parsed.normalizedKey);

    const resolved = await resolveChannel(input);
    res.json({
      valid: true,
      inputType: parsed.inputType,
      normalizedKey: parsed.normalizedKey,
      isDuplicate: Boolean(existing) || resolved.isDuplicate,
      channel: resolved.channel,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/campaigns/:id/creators - List candidate creators
creatorRouter.get('/', requireCampaignAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = CreatorQuerySchema.parse(req.query);
    const repos = getRepositories();
    const creators = await repos.creators.list(req.params.id, query);
    res.json(creators);
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/campaigns/:id/creators/validate-inputs - Live preview for Add Creators dialog
creatorRouter.post('/validate-inputs', requireCampaignAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { inputs } = BulkAddCreatorsInputSchema.parse(req.body);
    const repos = getRepositories();
    const existing = await repos.creators.list(req.params.id);
    const existingKeys = new Set(existing.map((c) => c.normalizedKey.toLowerCase()));
    if (existing.some((c) => c.channel?.channelId)) {
      existing.forEach((c) => {
        if (c.channel?.channelId) existingKeys.add(c.channel.channelId);
      });
    }

    const seenInBatch = new Set<string>();
    const results = inputs.map((raw) => {
      const parsed = parseCreatorInput(raw);
      if (!parsed.valid || !parsed.normalizedKey) {
        return {
          raw,
          status: 'invalid' as const,
          reason: parsed.error || 'Invalid format',
        };
      }

      const keyLower = parsed.normalizedKey.toLowerCase();
      if (existingKeys.has(keyLower) || seenInBatch.has(keyLower)) {
        return {
          raw,
          normalizedKey: parsed.normalizedKey,
          inputType: parsed.inputType,
          status: 'duplicate' as const,
          reason: 'Already added in this campaign',
        };
      }

      seenInBatch.add(keyLower);
      return {
        raw,
        normalizedKey: parsed.normalizedKey,
        inputType: parsed.inputType,
        status: 'valid' as const,
      };
    });

    res.json({ results });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/campaigns/:id/creators - Add one candidate creator
creatorRouter.post('/', requireCampaignAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = AddCreatorInputSchema.parse(req.body);
    const repos = getRepositories();
    const campaignId = req.params.id;

    // Capacity limit
    const currentCount = await repos.creators.count(campaignId);
    if (currentCount >= CONFIG.MAX_CREATORS_PER_CAMPAIGN) {
      throw AppError.validation(
        `Campaign creator limit reached. Maximum ${CONFIG.MAX_CREATORS_PER_CAMPAIGN} creators allowed per campaign.`
      );
    }

    // Parse input
    const parsed = parseCreatorInput(body.input);
    if (!parsed.valid || !parsed.normalizedKey || !parsed.inputType) {
      throw AppError.validation(parsed.error || 'Invalid creator handle, URL, or channel ID');
    }

    // Check duplicate
    const existing = await repos.creators.findByNormalizedKey(campaignId, parsed.normalizedKey);
    if (existing) {
      throw AppError.conflict(`Creator "${parsed.normalizedKey}" is already added to this campaign`);
    }

    // Attempt instant channel resolution
    let channelData = null;
    let status: Creator['status'] = 'pending';
    let errorMsg: string | null = null;

    try {
      const resolved = await resolveChannel(body.input);
      if (resolved.isDuplicate) {
        throw AppError.conflict(`Channel "${resolved.channel.title}" is already added to this campaign`);
      }
      channelData = {
        channelId: resolved.channel.channelId,
        title: resolved.channel.title,
        description: resolved.channel.description,
        customUrl: resolved.channel.customUrl,
        avatarUrl: resolved.channel.avatarUrl,
        subscriberCount: resolved.channel.subscriberCount,
        hiddenSubscriberCount: resolved.channel.hiddenSubscriberCount,
        videoCount: resolved.channel.videoCount,
        viewCount: resolved.channel.viewCount,
        country: resolved.channel.country,
        publishedAt: resolved.channel.publishedAt,
        channelAgeMonths: resolved.channel.publishedAt
          ? Math.floor((Date.now() - new Date(resolved.channel.publishedAt).getTime()) / (1000 * 86400 * 30))
          : 0,
        topicCategories: resolved.channel.topicCategories || [],
      };
      status = 'resolved';
    } catch (resolveErr: unknown) {
      if ((resolveErr as any)?.statusCode === 409) {
        throw resolveErr;
      }
      const msg = (resolveErr as Error).message || 'Failed to resolve YouTube channel';
      console.warn(`[Creators Route] Channel resolution failed for "${body.input}":`, msg);
      status = 'error';
      errorMsg = msg;
    }

    const created = await repos.creators.create(campaignId, {
      campaignId,
      input: body.input,
      inputType: parsed.inputType,
      normalizedKey: parsed.normalizedKey,
      status,
      channel: channelData,
      recentVideos: [],
      metrics: null,
      scores: null,
      selected: false,
      plannedPublishDate: null,
      notes: body.notes || '',
      tags: body.tags || [],
      error: errorMsg,
      analyzedAt: null,
    });

    await repos.activity.log({
      campaignId,
      actorEmail: req.user!.email,
      action: 'CREATOR_ADDED',
      entityType: 'creator',
      entityId: created.id,
      summary: `Added creator candidate "${channelData?.title || parsed.normalizedKey}"`,
    });

    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/campaigns/:id/creators/bulk - Bulk add creators
creatorRouter.post('/bulk', requireCampaignAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { inputs } = BulkAddCreatorsInputSchema.parse(req.body);
    const repos = getRepositories();
    const campaignId = req.params.id;

    const currentCount = await repos.creators.count(campaignId);
    const availableSlots = CONFIG.MAX_CREATORS_PER_CAMPAIGN - currentCount;

    if (availableSlots <= 0) {
      throw AppError.validation(
        `Campaign creator limit of ${CONFIG.MAX_CREATORS_PER_CAMPAIGN} already reached.`
      );
    }

    const existingCreators = await repos.creators.list(campaignId);
    const existingKeys = new Set(existingCreators.map((c) => c.normalizedKey.toLowerCase()));
    existingCreators.forEach((c) => {
      if (c.channel?.channelId) existingKeys.add(c.channel.channelId);
    });

    const seenInBatch = new Set<string>();
    const results: Array<{ raw: string; normalizedKey?: string; inputType?: string; status: 'added' | 'duplicate' | 'invalid'; reason?: string }> = [];
    const toCreate: Array<{ input: string; inputType: any; normalizedKey: string }> = [];

    for (const raw of inputs) {
      const parsed = parseCreatorInput(raw);
      if (!parsed.valid || !parsed.normalizedKey || !parsed.inputType) {
        results.push({
          raw,
          status: 'invalid',
          reason: parsed.error || 'Invalid format',
        });
        continue;
      }

      const keyLower = parsed.normalizedKey.toLowerCase();
      if (existingKeys.has(keyLower) || seenInBatch.has(keyLower)) {
        results.push({
          raw,
          normalizedKey: parsed.normalizedKey,
          inputType: parsed.inputType,
          status: 'duplicate',
          reason: 'Already added in this campaign',
        });
        continue;
      }

      if (toCreate.length >= availableSlots) {
        results.push({
          raw,
          normalizedKey: parsed.normalizedKey,
          inputType: parsed.inputType,
          status: 'invalid',
          reason: `Exceeds max creator limit of ${CONFIG.MAX_CREATORS_PER_CAMPAIGN}`,
        });
        continue;
      }

      seenInBatch.add(keyLower);
      toCreate.push({
        input: raw,
        inputType: parsed.inputType,
        normalizedKey: parsed.normalizedKey,
      });

      results.push({
        raw,
        normalizedKey: parsed.normalizedKey,
        inputType: parsed.inputType,
        status: 'added',
      });
    }

    // Save batch
    for (const item of toCreate) {
      let channelData = null;
      let status: Creator['status'] = 'pending';
      let errorMsg: string | null = null;

      try {
        const resolved = await resolveChannel(item.input);
        channelData = {
          channelId: resolved.channel.channelId,
          title: resolved.channel.title,
          description: resolved.channel.description,
          customUrl: resolved.channel.customUrl,
          avatarUrl: resolved.channel.avatarUrl,
          subscriberCount: resolved.channel.subscriberCount,
          hiddenSubscriberCount: resolved.channel.hiddenSubscriberCount,
          videoCount: resolved.channel.videoCount,
          viewCount: resolved.channel.viewCount,
          country: resolved.channel.country,
          publishedAt: resolved.channel.publishedAt,
          channelAgeMonths: resolved.channel.publishedAt
            ? Math.floor((Date.now() - new Date(resolved.channel.publishedAt).getTime()) / (1000 * 86400 * 30))
            : 0,
          topicCategories: resolved.channel.topicCategories || [],
        };
        status = 'resolved';
      } catch (err: unknown) {
        const msg = (err as Error).message || 'Failed to resolve YouTube channel';
        console.warn(`[Creators Route Bulk] Channel resolution failed for "${item.input}":`, msg);
        status = 'error';
        errorMsg = msg;
      }

      await repos.creators.create(campaignId, {
        campaignId,
        input: item.input,
        inputType: item.inputType,
        normalizedKey: item.normalizedKey,
        status,
        channel: channelData,
        recentVideos: [],
        metrics: null,
        scores: null,
        selected: false,
        plannedPublishDate: null,
        notes: '',
        tags: [],
        error: errorMsg,
        analyzedAt: null,
      });
    }

    if (toCreate.length > 0) {
      await repos.activity.log({
        campaignId,
        actorEmail: req.user!.email,
        action: 'CREATORS_BULK_ADDED',
        entityType: 'creator',
        entityId: campaignId,
        summary: `Bulk added ${toCreate.length} candidate creators`,
      });
    }

    res.status(201).json({ results, addedCount: toCreate.length });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/campaigns/:id/creators/:creatorId - Get one creator
creatorRouter.get('/:creatorId', requireCampaignAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repos = getRepositories();
    const creator = await repos.creators.getById(req.params.id, req.params.creatorId);
    if (!creator) {
      throw AppError.notFound(`Creator ${req.params.creatorId} not found`);
    }
    res.json(creator);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/campaigns/:id/creators/:creatorId - Update creator metadata / selection
creatorRouter.patch('/:creatorId', requireCampaignAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = UpdateCreatorInputSchema.parse(req.body);
    const repos = getRepositories();
    const { version, ...updates } = body;

    const updated = await repos.creators.update(
      req.params.id,
      req.params.creatorId,
      version,
      updates
    );

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/campaigns/:id/creators/:creatorId - Remove candidate creator
creatorRouter.delete('/:creatorId', requireCampaignAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repos = getRepositories();
    const campaignId = req.params.id;
    const creatorId = req.params.creatorId;

    const existing = await repos.creators.getById(campaignId, creatorId);
    if (!existing) {
      res.json({ message: 'Creator removed', id: creatorId });
      return;
    }

    await repos.creators.delete(campaignId, creatorId);

    // Recompute scores for all remaining analyzed creators
    const remaining = await repos.creators.list(campaignId);
    const campaign = await repos.campaigns.getById(campaignId);
    const budget = (campaign?.brief as any)?.budgetUsd || 10000;
    const aligned = recomputeAllScores(remaining, budget);
    await repos.creators.bulkUpsert(campaignId, aligned);

    await repos.activity.log({
      campaignId,
      actorEmail: req.user!.email,
      action: 'CREATOR_REMOVED',
      entityType: 'creator',
      entityId: creatorId,
      summary: `Removed candidate creator "${existing.channel?.title || existing.normalizedKey}"`,
    });

    res.json({ message: 'Creator removed', id: creatorId });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/campaigns/:id/discovery/run - Run Discovery Background Job
creatorRouter.post('/discovery/run', requireCampaignAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const campaignId = req.params.id;
    const force = Boolean(req.body.force);
    const repos = getRepositories();

    // Check YouTube quota limit
    checkQuotaAvailable();

    const campaign = req.campaign!;
    const briefParse = CampaignBriefSchema.safeParse(campaign.brief);
    if (!briefParse.success) {
      throw AppError.validation('Campaign brief must be completed before running discovery');
    }

    const creators = await repos.creators.list(campaignId);
    if (creators.length === 0) {
      throw AppError.validation('At least 1 candidate creator is required to run discovery');
    }
    if (creators.length < 2 && !force) {
      throw AppError.validation('At least 2 candidate creators are required to run comparative discovery. For a single creator, use the Check Budget Fit flow.');
    }

    // Start background job
    const job = await globalJobRunner.createJob(
      'DISCOVERY',
      campaignId,
      req.user!.uid,
      async (ctx) => {
        return await executeCampaignDiscovery(campaignId, {
          force,
          updateProgress: ctx.updateProgress,
          isCancelled: ctx.isCancelled,
        });
      }
    );

    res.status(202).json({
      jobId: job.id,
      status: job.status,
      message: 'Discovery job started',
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/campaigns/:id/creators/:creatorId/analyze - Analyze single creator
creatorRouter.post('/:creatorId/analyze', requireCampaignAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const campaignId = req.params.id;
    const creatorId = req.params.creatorId;
    const repos = getRepositories();

    checkQuotaAvailable();

    const campaign = req.campaign!;
    const briefParse = CampaignBriefSchema.safeParse(campaign.brief);
    if (!briefParse.success) {
      throw AppError.validation('Campaign brief must be completed before analyzing creators');
    }

    const creator = await repos.creators.getById(campaignId, creatorId);
    if (!creator) {
      throw AppError.notFound(`Creator ${creatorId} not found`);
    }

    const allCreators = await repos.creators.list(campaignId);

    const job = await globalJobRunner.createJob(
      'ANALYZE_CREATOR',
      campaignId,
      req.user!.uid,
      async (ctx) => {
        await ctx.updateProgress(10, 100, `Analyzing creator ${creator.channel?.title || creator.normalizedKey}...`);
        const analyzed = await analyzeCreator(
          campaignId,
          creator,
          briefParse.data,
          briefParse.data.budgetUsd,
          allCreators
        );

        // Recompute all scores
        const refreshed = await repos.creators.list(campaignId);
        const aligned = recomputeAllScores(refreshed, briefParse.data.budgetUsd);
        await repos.creators.bulkUpsert(campaignId, aligned);

        await ctx.updateProgress(100, 100, `Analysis completed`);
        return { creatorId: analyzed.id, fitScore: analyzed.scores?.fitScore };
      }
    );

    res.status(202).json({
      jobId: job.id,
      status: job.status,
      message: 'Creator analysis job started',
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/campaigns/:id/creators/:creatorId/budget-fit - Quick lightweight budget fit check for single creator
creatorRouter.post('/:creatorId/budget-fit', requireCampaignAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const campaignId = req.params.id;
    const creatorId = req.params.creatorId;
    const repos = getRepositories();

    checkQuotaAvailable();

    const campaign = req.campaign!;
    const briefParse = CampaignBriefSchema.safeParse(campaign.brief);
    const campaignBudget = briefParse.success ? briefParse.data.budgetUsd || 10000 : (campaign.brief as any)?.budgetUsd || 10000;

    const creator = await repos.creators.getById(campaignId, creatorId);
    if (!creator) {
      throw AppError.notFound(`Creator ${creatorId} not found`);
    }

    const result = await checkSingleCreatorBudgetFit(campaignId, creator, campaignBudget);

    await repos.activity.log({
      campaignId,
      actorEmail: req.user!.email,
      action: 'CREATOR_BUDGET_CHECKED',
      entityType: 'creator',
      entityId: creatorId,
      summary: `Checked budget fit for ${result.creator.channel?.title || result.creator.normalizedKey}: est. $${result.estimatedCostUsd.midpoint.toLocaleString()} (${result.percentageOfBudget}% of budget)`,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/campaigns/:id/creators/select-recommended - Select top 5 Strong/Possible fit
creatorRouter.post('/select-recommended', requireCampaignAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const campaignId = req.params.id;
    const repos = getRepositories();
    const creators = await repos.creators.list(campaignId);

    // Eligible creators: status 'analyzed' and tier is Strong fit or Possible fit, sorted by fitScore desc
    const eligible = creators
      .filter((c) => c.status === 'analyzed' && (c.scores?.tier === 'Strong fit' || c.scores?.tier === 'Possible fit'))
      .sort((a, b) => (b.scores?.fitScore || 0) - (a.scores?.fitScore || 0));

    const top5Ids = new Set(eligible.slice(0, 5).map((c) => c.id));

    const updatedList: Creator[] = [];
    for (const c of creators) {
      const shouldSelect = top5Ids.has(c.id);
      if (c.selected !== shouldSelect) {
        const updated = await repos.creators.update(campaignId, c.id, c.version, {
          selected: shouldSelect,
        });
        updatedList.push(updated);
      } else {
        updatedList.push(c);
      }
    }

    await repos.activity.log({
      campaignId,
      actorEmail: req.user!.email,
      action: 'RECOMMENDED_LINEUP_SELECTED',
      entityType: 'campaign',
      entityId: campaignId,
      summary: `Selected top ${top5Ids.size} recommended creators`,
    });

    res.json({
      selectedCount: top5Ids.size,
      creators: updatedList,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/campaigns/:id/creators/batch-action - Batch select, deselect, or remove
creatorRouter.post('/batch-action', requireCampaignAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const campaignId = req.params.id;
    const { action, creatorIds } = req.body;
    if (!action || !Array.isArray(creatorIds) || creatorIds.length === 0) {
      throw AppError.validation('Action and non-empty creatorIds array required');
    }

    const repos = getRepositories();
    const creators = await repos.creators.list(campaignId);
    const targetMap = new Map(creators.map((c) => [c.id, c]));

    let modifiedCount = 0;
    if (action === 'select' || action === 'deselect') {
      const targetSelected = action === 'select';
      for (const id of creatorIds) {
        const creator = targetMap.get(id);
        if (creator && creator.selected !== targetSelected) {
          await repos.creators.update(campaignId, id, creator.version, { selected: targetSelected });
          modifiedCount++;
        }
      }
    } else if (action === 'remove') {
      for (const id of creatorIds) {
        if (targetMap.has(id)) {
          await repos.creators.delete(campaignId, id);
          modifiedCount++;
        }
      }
      // Recompute scores
      const remaining = await repos.creators.list(campaignId);
      const campaign = await repos.campaigns.getById(campaignId);
      const budget = (campaign?.brief as any)?.budgetUsd || 10000;
      const aligned = recomputeAllScores(remaining, budget);
      await repos.creators.bulkUpsert(campaignId, aligned);
    } else if (action === 'reanalyze') {
      for (const id of creatorIds) {
        const creator = targetMap.get(id);
        if (creator) {
          await repos.creators.update(campaignId, id, creator.version, { status: 'pending', error: null });
          modifiedCount++;
        }
      }
    } else {
      throw AppError.validation(`Unsupported action "${action}"`);
    }

    res.json({ success: true, action, modifiedCount });
  } catch (err) {
    next(err);
  }
});
