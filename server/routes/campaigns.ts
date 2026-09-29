import { Router, Request, Response, NextFunction } from 'express';
import {
  CreateCampaignInputSchema,
  UpdateCampaignInputSchema,
  CampaignQuerySchema,
  CampaignExportSchema,
  CampaignBriefSchema,
  PutBriefInputSchema,
  PatchBriefInputSchema,
  isBriefComplete,
} from '../../shared/types.ts';
import { getRepositories } from '../repositories/index.ts';
import { requireCampaignAccess, requireCampaignOwner } from '../middleware/campaignAuth.ts';
import { AppError } from '../errors/AppError.ts';
import { creatorRouter } from './creators.ts';
import { premortemRouter } from './premortem.ts';
import { briefRouter } from './briefs.ts';
import { searchPackRouter } from './searchPack.ts';
import { pulseRouter } from './pulse.ts';
import { checkQuotaAvailable } from '../services/youtube.ts';
import { globalJobRunner } from '../jobs/runner.ts';
import { executeCampaignDiscovery } from '../engines/discovery/discoveryEngine.ts';

export const campaignRouter = Router();

// GET /api/v1/campaigns - List campaigns owned or member of
campaignRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;
    const parsedQuery = CampaignQuerySchema.parse(req.query);
    const repos = getRepositories();

    const result = await repos.campaigns.list(parsedQuery, user.email, user.uid);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/campaigns/trash - Trashed campaigns owned by user
campaignRouter.get('/trash', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;
    const repos = getRepositories();
    const result = await repos.campaigns.listTrash(user.uid);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/campaigns - Create campaign
campaignRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;
    const input = CreateCampaignInputSchema.parse(req.body);
    const repos = getRepositories();

    const campaign = await repos.campaigns.create({
      ownerId: user.uid,
      ownerEmail: user.email,
      memberEmails: [],
      name: input.name,
      status: 'draft',
      brief: {},
      settings: {},
      approvedLineup: [],
    });

    await repos.activity.log({
      campaignId: campaign.id,
      actorEmail: user.email,
      action: 'CAMPAIGN_CREATED',
      entityType: 'campaign',
      entityId: campaign.id,
      summary: `Created campaign "${campaign.name}"`,
    });

    res.status(201).json(campaign);
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/campaigns/import - Import campaign
campaignRouter.post('/import', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;
    const validated = CampaignExportSchema.parse(req.body);
    const repos = getRepositories();

    const campaign = await repos.campaigns.importData(validated as unknown as Record<string, unknown>, user.uid, user.email);

    await repos.activity.log({
      campaignId: campaign.id,
      actorEmail: user.email,
      action: 'CAMPAIGN_IMPORTED',
      entityType: 'campaign',
      entityId: campaign.id,
      summary: `Imported campaign "${campaign.name}"`,
    });

    res.status(201).json(campaign);
  } catch (err) {
    next(err);
  }
});

// Specific Campaign Routes
// GET /api/v1/campaigns/:id
campaignRouter.get('/:id', requireCampaignAccess, async (req: Request, res: Response) => {
  res.json(req.campaign);
});

// PATCH /api/v1/campaigns/:id - Update name, status, members with optimistic concurrency
campaignRouter.patch('/:id', requireCampaignAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = UpdateCampaignInputSchema.parse(req.body);
    const user = req.user!;
    const repos = getRepositories();

    // If changing memberEmails, require owner
    if (input.memberEmails !== undefined) {
      const isOwner = req.campaign!.ownerId === user.uid || req.campaign!.ownerEmail.toLowerCase() === user.email.toLowerCase();
      if (!isOwner) {
        throw AppError.forbidden('Only the owner can modify member emails');
      }
    }

    const updated = await repos.campaigns.update(req.campaign!.id, input.version, input);

    const changes: string[] = [];
    if (input.name) changes.push(`renamed to "${input.name}"`);
    if (input.status) changes.push(`status changed to "${input.status}"`);
    if (input.memberEmails) changes.push(`updated members`);

    await repos.activity.log({
      campaignId: updated.id,
      actorEmail: user.email,
      action: 'CAMPAIGN_UPDATED',
      entityType: 'campaign',
      entityId: updated.id,
      summary: `Updated campaign: ${changes.join(', ') || 'details modified'}`,
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/campaigns/:id - Soft delete (Move to trash) (Owner only)
campaignRouter.delete('/:id', requireCampaignAccess, requireCampaignOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const version = Number(req.body?.version ?? req.query?.version);
    if (isNaN(version)) {
      throw AppError.validation('Version parameter is required for optimistic concurrency');
    }

    const repos = getRepositories();
    const updated = await repos.campaigns.softDelete(req.campaign!.id, version);

    await repos.activity.log({
      campaignId: updated.id,
      actorEmail: req.user!.email,
      action: 'CAMPAIGN_TRASHED',
      entityType: 'campaign',
      entityId: updated.id,
      summary: `Moved campaign "${updated.name}" to trash`,
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/campaigns/:id/restore - Restore from trash (Owner only)
campaignRouter.post('/:id/restore', requireCampaignAccess, requireCampaignOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repos = getRepositories();
    const restored = await repos.campaigns.restore(req.campaign!.id);

    await repos.activity.log({
      campaignId: restored.id,
      actorEmail: req.user!.email,
      action: 'CAMPAIGN_RESTORED',
      entityType: 'campaign',
      entityId: restored.id,
      summary: `Restored campaign "${restored.name}" from trash`,
    });

    res.json(restored);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/campaigns/:id/permanent - Hard delete campaign and subcollections (Owner only, in trash)
campaignRouter.delete('/:id/permanent', requireCampaignAccess, requireCampaignOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.campaign!.deletedAt) {
      throw AppError.unprocessable('Campaign must be moved to trash before permanent deletion');
    }

    const repos = getRepositories();
    await repos.campaigns.hardDelete(req.campaign!.id);

    res.json({ message: 'Campaign permanently deleted' });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/campaigns/:id/duplicate - Duplicate campaign (Auth: Owner, Member, or caller duplicating existing campaign they have access to)
campaignRouter.post('/:id/duplicate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;
    const repos = getRepositories();
    const existing = await repos.campaigns.getById(req.params.id);

    if (!existing) {
      throw AppError.notFound('Campaign not found');
    }

    const isOwner = existing.ownerId === user.uid || existing.ownerEmail.toLowerCase() === user.email.toLowerCase();
    const isMember = existing.memberEmails?.some((m) => m.toLowerCase() === user.email.toLowerCase());

    // Per SPEC: Access is "Auth" (authenticated user), but if existing campaign is private, only accessible to members/owners or return 404
    if (!isOwner && !isMember) {
      // If user has access or duplicate is permitted for auth users having access
      // Check if user is owner/member
      throw AppError.notFound('Campaign not found');
    }

    const duplicated = await repos.campaigns.duplicate(existing.id, user.uid, user.email);

    await repos.activity.log({
      campaignId: duplicated.id,
      actorEmail: user.email,
      action: 'CAMPAIGN_DUPLICATED',
      entityType: 'campaign',
      entityId: duplicated.id,
      summary: `Duplicated from "${existing.name}"`,
    });

    res.status(201).json(duplicated);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/campaigns/:id/export - Export JSON
campaignRouter.get('/:id/export', requireCampaignAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repos = getRepositories();
    const data = await repos.campaigns.exportData(req.campaign!.id);
    res.setHeader('Content-Disposition', `attachment; filename="${req.campaign!.name.replace(/[^a-z0-9]/gi, '_')}-export.json"`);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/campaigns/:id/activity - List campaign activity
campaignRouter.get('/:id/activity', requireCampaignAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repos = getRepositories();
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
    const cursor = req.query.cursor as string | undefined;

    const result = await repos.activity.listByCampaign(req.campaign!.id, limit, cursor);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/campaigns/:id/jobs - Active jobs for campaign
campaignRouter.get('/:id/jobs', requireCampaignAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repos = getRepositories();
    const jobs = await repos.jobs.listRunningByCampaign(req.campaign!.id);
    res.json({ items: jobs });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/campaigns/:id/brief - Get campaign brief
campaignRouter.get('/:id/brief', requireCampaignAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const brief = req.campaign!.brief && Object.keys(req.campaign!.brief).length > 0 ? req.campaign!.brief : null;
    res.json({
      brief,
      version: req.campaign!.version,
      isComplete: isBriefComplete(brief),
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/v1/campaigns/:id/brief - Full replace brief (version required)
campaignRouter.put('/:id/brief', requireCampaignAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = PutBriefInputSchema.parse(req.body);
    const repos = getRepositories();

    // Launch date check: must not be in the past while campaign is draft
    if (req.campaign!.status === 'draft') {
      const launch = new Date(body.launchDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (launch < today) {
        throw AppError.validation('Launch date must not be in the past while the campaign is a draft', [
          { field: 'launchDate', message: 'Launch date cannot be in the past for a draft campaign' },
        ]);
      }
    }

    const { version, ...briefData } = body;
    const updated = await repos.campaigns.update(req.campaign!.id, version, {
      brief: briefData as unknown as Record<string, unknown>,
    });

    await repos.activity.log({
      campaignId: updated.id,
      actorEmail: req.user!.email,
      action: 'BRIEF_UPDATED',
      entityType: 'campaign',
      entityId: updated.id,
      summary: `Updated campaign brief for "${briefData.productName}"`,
    });

    res.json({
      brief: updated.brief,
      version: updated.version,
      isComplete: isBriefComplete(updated.brief),
      campaign: updated,
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/campaigns/:id/brief - Partial update brief (version required)
campaignRouter.patch('/:id/brief', requireCampaignAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = PatchBriefInputSchema.parse(req.body);
    const repos = getRepositories();

    const currentBrief = (req.campaign!.brief as Record<string, unknown>) || {};
    const { version, ...partialBrief } = body;

    const merged = {
      ...currentBrief,
      ...partialBrief,
    };

    // If campaign is draft and launchDate is provided or exists, validate it
    if (req.campaign!.status === 'draft' && merged.launchDate) {
      const launch = new Date(merged.launchDate as string);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (launch < today) {
        throw AppError.validation('Launch date must not be in the past while the campaign is a draft', [
          { field: 'launchDate', message: 'Launch date cannot be in the past for a draft campaign' },
        ]);
      }
    }

    let validatedBrief: Record<string, unknown> = merged;
    const fullParse = CampaignBriefSchema.safeParse(merged);
    if (fullParse.success) {
      validatedBrief = fullParse.data as unknown as Record<string, unknown>;
    } else {
      const partialParse = CampaignBriefSchema.partial().parse(merged);
      validatedBrief = partialParse as unknown as Record<string, unknown>;
    }

    const updated = await repos.campaigns.update(req.campaign!.id, version, {
      brief: validatedBrief,
    });

    await repos.activity.log({
      campaignId: updated.id,
      actorEmail: req.user!.email,
      action: 'BRIEF_UPDATED',
      entityType: 'campaign',
      entityId: updated.id,
      summary: `Updated campaign brief for "${(validatedBrief.productName as string) || (validatedBrief.brandName as string) || updated.name}"`,
    });

    res.json({
      brief: updated.brief,
      version: updated.version,
      isComplete: isBriefComplete(updated.brief),
      campaign: updated,
    });
  } catch (err) {
    next(err);
  }
});

// Mount Creators Sub-router
campaignRouter.use('/:id/creators', creatorRouter);

// Mount Pre-Mortem Sub-router
campaignRouter.use('/:id/premortem', premortemRouter);

// Mount Creator Briefs Sub-router
campaignRouter.use('/:id/briefs', briefRouter);

// Mount Search Pack Sub-router
campaignRouter.use('/:id/search-pack', searchPackRouter);

// Mount Live Pulse Sub-router
campaignRouter.use('/:id/live', pulseRouter);

// POST /api/v1/campaigns/:id/discovery/run - Run Discovery Background Job
campaignRouter.post('/:id/discovery/run', requireCampaignAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const campaignId = req.params.id;
    const force = Boolean(req.body.force);
    const repos = getRepositories();

    // Check YouTube quota availability
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
