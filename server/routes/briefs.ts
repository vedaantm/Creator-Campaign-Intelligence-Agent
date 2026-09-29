import { Router, Request, Response, NextFunction } from 'express';
import {
  GenerateBriefsInputSchema,
  RegenerateBriefInputSchema,
  PatchBriefContentInputSchema,
  PatchBriefStatusInputSchema,
  CreatorBrief,
  CreatorBriefVersion,
  CampaignBrief,
} from '../../shared/types.ts';
import { getRepositories } from '../repositories/index.ts';
import { requireCampaignAccess } from '../middleware/campaignAuth.ts';
import { globalJobRunner } from '../jobs/runner.ts';
import { generateCreatorBrief } from '../engines/briefs/briefEngine.ts';
import { detectChangedFieldPaths } from '../engines/briefs/preserveEditsMerge.ts';
import { briefToMarkdown, createBriefsZipArchive } from '../engines/briefs/markdownExporter.ts';
import { AppError } from '../errors/AppError.ts';

export const briefRouter = Router({ mergeParams: true });

/**
 * Helper to get list of creator IDs in approved lineup.
 */
function getApprovedCreatorIds(campaign: any): string[] {
  if (!campaign?.approvedLineup) return [];
  if (Array.isArray(campaign.approvedLineup)) {
    return campaign.approvedLineup;
  }
  return campaign.approvedLineup.creatorIds || [];
}

// GET /api/v1/campaigns/:id/briefs - List all briefs for campaign
briefRouter.get('/', requireCampaignAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repos = getRepositories();
    const briefs = await repos.briefs.list(req.params.id);
    res.json(briefs);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/campaigns/:id/briefs/export.zip - Export all briefs as a zip archive
briefRouter.get('/export.zip', requireCampaignAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const campaignId = req.params.id;
    const campaign = req.campaign!;
    const repos = getRepositories();

    const briefs = await repos.briefs.list(campaignId);
    const creators = await repos.creators.list(campaignId);
    const creatorMap = new Map(creators.map((c) => [c.id, c]));

    const briefsWithCreators = briefs.map((b) => ({
      brief: b,
      creator: creatorMap.get(b.creatorId) || null,
    }));

    const zipBuffer = await createBriefsZipArchive(briefsWithCreators, campaign.name);

    const safeCampaignName = campaign.name.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${safeCampaignName}-creator-briefs.zip"`);
    res.send(zipBuffer);
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/campaigns/:id/briefs/generate - Batch generate briefs for approved lineup creators
briefRouter.post('/generate', requireCampaignAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const campaignId = req.params.id;
    const campaign = req.campaign!;
    const body = GenerateBriefsInputSchema.parse(req.body);
    const repos = getRepositories();

    const brief = campaign.brief as CampaignBrief;
    if (!brief || !brief.brandName || !brief.approvedFacts || brief.approvedFacts.length === 0) {
      throw AppError.validation('Campaign brief must be completed with approved brand facts before generating creator briefs');
    }

    const approvedIds = getApprovedCreatorIds(campaign);
    if (approvedIds.length === 0) {
      throw AppError.validation(
        'Only creators in the approved lineup get briefs. Please run Pre-Mortem Simulator and approve a lineup first.'
      );
    }

    let targetIds = body.creatorIds && body.creatorIds.length > 0 ? body.creatorIds : approvedIds;
    // Enforce that target creators must be in the approved lineup
    for (const tId of targetIds) {
      if (!approvedIds.includes(tId)) {
        throw AppError.validation(`Creator ${tId} is not in the approved lineup. Only approved creators get briefs.`);
      }
    }

    // Filter out creators whose brief is already final unless force = true
    const existingBriefs = await repos.briefs.list(campaignId);
    const existingBriefMap = new Map(existingBriefs.map((b) => [b.creatorId, b]));

    if (!body.force) {
      targetIds = targetIds.filter((id) => {
        const b = existingBriefMap.get(id);
        return b?.status !== 'final';
      });
    }

    if (targetIds.length === 0) {
      res.json({
        message: 'All targeted creator briefs are already marked as Final. Use force=true to overwrite.',
        jobId: null,
      });
      return;
    }

    const job = await globalJobRunner.createJob(
      'BRIEF_GENERATION',
      campaignId,
      req.user!.uid,
      async (ctx) => {
        const allCreators = await repos.creators.list(campaignId);
        const creatorMap = new Map(allCreators.map((c) => [c.id, c]));

        const succeeded: string[] = [];
        const failed: string[] = [];

        for (let i = 0; i < targetIds.length; i++) {
          if (await ctx.isCancelled()) throw new Error('JOB_CANCELLED');

          const cId = targetIds[i];
          const creator = creatorMap.get(cId);
          if (!creator) {
            failed.push(cId);
            continue;
          }

          const creatorName = creator.channel?.title || creator.normalizedKey;
          const prog = Math.round((i / targetIds.length) * 100);
          await ctx.updateProgress(
            prog,
            100,
            `Generating brief for ${creatorName} (${i + 1}/${targetIds.length})...`
          );

          try {
            const existingBrief = existingBriefMap.get(cId) || null;
            const generated = await generateCreatorBrief({
              campaign,
              brief,
              creator,
              userInstruction: body.instruction,
              existingBrief,
              preserveEdits: false, // Initial batch generation
            });

            const newVersionNum = (existingBrief?.currentVersion || 0) + 1;
            const now = new Date().toISOString();

            const briefDoc: CreatorBrief = {
              id: cId,
              campaignId,
              creatorId: cId,
              status: generated.status,
              content: generated,
              editedFields: existingBrief?.editedFields || [],
              currentVersion: newVersionNum,
              generatedAt: existingBrief?.generatedAt || now,
              updatedAt: now,
              version: (existingBrief?.version || 0) + 1,
            };

            const saved = await repos.briefs.upsert(campaignId, briefDoc);

            // Create initial version snapshot
            const versionSnapshot: CreatorBriefVersion = {
              id: `v_${saved.id}_${newVersionNum}`,
              versionNumber: newVersionNum,
              briefId: saved.id,
              creatorId: cId,
              content: generated,
              status: generated.status,
              editedFields: briefDoc.editedFields,
              savedBy: req.user!.email,
              savedAt: now,
              changeNote: 'Initial automated generation',
            };
            await repos.briefs.createVersion(campaignId, cId, versionSnapshot);

            await repos.activity.log({
              campaignId,
              actorEmail: req.user!.email,
              action: 'BRIEF_GENERATED',
              entityType: 'creatorBrief',
              entityId: cId,
              summary: `Generated collaboration brief for ${creatorName} (v${newVersionNum})`,
            });

            succeeded.push(cId);
          } catch (genErr) {
            console.error(`[BriefEngine] Failed to generate brief for ${cId}:`, genErr);
            failed.push(cId);
          }
        }

        await ctx.updateProgress(100, 100, `Completed brief generation (${succeeded.length} succeeded, ${failed.length} failed)`);
        return { succeeded, failed };
      }
    );

    res.status(202).json({
      jobId: job.id,
      status: job.status,
      message: `Brief generation started for ${targetIds.length} creators`,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/campaigns/:id/briefs/:creatorId/regenerate - Regenerate single creator brief with preserveEdits
briefRouter.post('/:creatorId/regenerate', requireCampaignAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const campaignId = req.params.id;
    const creatorId = req.params.creatorId;
    const campaign = req.campaign!;
    const body = RegenerateBriefInputSchema.parse(req.body);
    const repos = getRepositories();

    const brief = campaign.brief as CampaignBrief;
    if (!brief || !brief.brandName || !brief.approvedFacts) {
      throw AppError.validation('Campaign brief must be completed before regenerating creator briefs');
    }

    const creator = await repos.creators.getById(campaignId, creatorId);
    if (!creator) {
      throw AppError.notFound(`Creator ${creatorId} not found`);
    }

    const approvedIds = getApprovedCreatorIds(campaign);
    if (!approvedIds.includes(creatorId)) {
      throw AppError.validation('Only creators in the approved lineup get briefs');
    }

    const existingBrief = await repos.briefs.getById(campaignId, creatorId);

    const job = await globalJobRunner.createJob(
      'BRIEF_REGENERATION',
      campaignId,
      req.user!.uid,
      async (ctx) => {
        await ctx.updateProgress(10, 100, `Regenerating brief for ${creator.channel?.title || creator.normalizedKey}...`);

        const generated = await generateCreatorBrief({
          campaign,
          brief,
          creator,
          userInstruction: body.instruction,
          existingBrief,
          preserveEdits: body.preserveEdits ?? true,
        });

        const newVersionNum = (existingBrief?.currentVersion || 0) + 1;
        const now = new Date().toISOString();

        const briefDoc: CreatorBrief = {
          id: creatorId,
          campaignId,
          creatorId,
          status: generated.status,
          content: generated,
          editedFields: body.preserveEdits ? (existingBrief?.editedFields || []) : [],
          currentVersion: newVersionNum,
          generatedAt: existingBrief?.generatedAt || now,
          updatedAt: now,
          version: (existingBrief?.version || 0) + 1,
        };

        const saved = await repos.briefs.upsert(campaignId, briefDoc);

        const versionSnapshot: CreatorBriefVersion = {
          id: `v_${saved.id}_${newVersionNum}`,
          versionNumber: newVersionNum,
          briefId: saved.id,
          creatorId,
          content: generated,
          status: generated.status,
          editedFields: briefDoc.editedFields,
          savedBy: req.user!.email,
          savedAt: now,
          changeNote: body.instruction ? `Regenerated: "${body.instruction}"` : 'Regenerated with latest creator telemetry',
        };
        await repos.briefs.createVersion(campaignId, creatorId, versionSnapshot);

        await repos.activity.log({
          campaignId,
          actorEmail: req.user!.email,
          action: 'BRIEF_REGENERATED',
          entityType: 'creatorBrief',
          entityId: creatorId,
          summary: `Regenerated brief for ${creator.channel?.title || creator.normalizedKey} (v${newVersionNum})`,
        });

        await ctx.updateProgress(100, 100, 'Brief regenerated successfully');
        return saved;
      }
    );

    res.status(202).json({
      jobId: job.id,
      status: job.status,
      message: 'Brief regeneration started',
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/campaigns/:id/briefs/:creatorId/export - Export single brief as Markdown
briefRouter.get('/:creatorId/export', requireCampaignAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const campaignId = req.params.id;
    const creatorId = req.params.creatorId;
    const repos = getRepositories();

    const brief = await repos.briefs.getById(campaignId, creatorId);
    if (!brief) {
      throw AppError.notFound(`Brief for creator ${creatorId} not found`);
    }

    const creator = await repos.creators.getById(campaignId, creatorId);
    const md = briefToMarkdown(brief, creator, req.campaign!.name);

    const rawName = creator?.channel?.title || creator?.normalizedKey || creatorId;
    const safeFilename = rawName.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();

    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}-brief-v${brief.currentVersion}.md"`);
    res.send(md);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/campaigns/:id/briefs/:creatorId/versions - List version history for brief
briefRouter.get('/:creatorId/versions', requireCampaignAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repos = getRepositories();
    const versions = await repos.briefs.listVersions(req.params.id, req.params.creatorId);
    res.json(versions);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/campaigns/:id/briefs/:creatorId/versions/:n - Get specific version snapshot
briefRouter.get('/:creatorId/versions/:n', requireCampaignAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repos = getRepositories();
    const versionNum = parseInt(req.params.n, 10);
    if (isNaN(versionNum) || versionNum < 1) {
      throw AppError.validation('Invalid version number');
    }
    const version = await repos.briefs.getVersion(req.params.id, req.params.creatorId, versionNum);
    if (!version) {
      throw AppError.notFound(`Version ${versionNum} not found for creator ${req.params.creatorId}`);
    }
    res.json(version);
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/campaigns/:id/briefs/:creatorId/versions/:n/restore - Restore historical version (creates NEW version snapshot)
briefRouter.post('/:creatorId/versions/:n/restore', requireCampaignAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const campaignId = req.params.id;
    const creatorId = req.params.creatorId;
    const versionNum = parseInt(req.params.n, 10);
    const repos = getRepositories();

    const targetVersion = await repos.briefs.getVersion(campaignId, creatorId, versionNum);
    if (!targetVersion) {
      throw AppError.notFound(`Version ${versionNum} not found`);
    }

    const currentBrief = await repos.briefs.getById(campaignId, creatorId);
    if (!currentBrief) {
      throw AppError.notFound(`Current brief not found`);
    }

    const newVersionNum = currentBrief.currentVersion + 1;
    const now = new Date().toISOString();

    // Create a new version snapshot for the restore action (History is NEVER overwritten)
    const restoreSnapshot: CreatorBriefVersion = {
      id: `v_${creatorId}_${newVersionNum}`,
      versionNumber: newVersionNum,
      briefId: currentBrief.id,
      creatorId,
      content: targetVersion.content,
      status: targetVersion.status,
      editedFields: targetVersion.editedFields,
      savedBy: req.user!.email,
      savedAt: now,
      changeNote: `Restored from version ${versionNum}`,
    };
    await repos.briefs.createVersion(campaignId, creatorId, restoreSnapshot);

    const updated = await repos.briefs.update(campaignId, creatorId, currentBrief.version, {
      content: targetVersion.content,
      status: targetVersion.status,
      editedFields: targetVersion.editedFields,
      currentVersion: newVersionNum,
    });

    await repos.activity.log({
      campaignId,
      actorEmail: req.user!.email,
      action: 'BRIEF_VERSION_RESTORED',
      entityType: 'creatorBrief',
      entityId: creatorId,
      summary: `Restored brief for ${creatorId} from v${versionNum} as new v${newVersionNum}`,
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/campaigns/:id/briefs/:creatorId - Get single brief
briefRouter.get('/:creatorId', requireCampaignAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repos = getRepositories();
    const brief = await repos.briefs.getById(req.params.id, req.params.creatorId);
    if (!brief) {
      throw AppError.notFound(`Brief for creator ${req.params.creatorId} not found`);
    }
    res.json(brief);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/campaigns/:id/briefs/:creatorId - Update brief content and create version snapshot
briefRouter.patch('/:creatorId', requireCampaignAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const campaignId = req.params.id;
    const creatorId = req.params.creatorId;
    const body = PatchBriefContentInputSchema.parse(req.body);
    const repos = getRepositories();

    const existing = await repos.briefs.getById(campaignId, creatorId);
    if (!existing) {
      throw AppError.notFound(`Brief for creator ${creatorId} not found`);
    }

    // Detect changed field paths to update editedFields
    const changedPaths = detectChangedFieldPaths(existing.content, body.content);
    const newEditedFields = Array.from(new Set([...existing.editedFields, ...changedPaths]));

    const newVersionNum = existing.currentVersion + 1;
    const now = new Date().toISOString();

    // Create version snapshot
    const versionSnapshot: CreatorBriefVersion = {
      id: `v_${creatorId}_${newVersionNum}`,
      versionNumber: newVersionNum,
      briefId: existing.id,
      creatorId,
      content: body.content,
      status: existing.status,
      editedFields: newEditedFields,
      savedBy: req.user!.email,
      savedAt: now,
      changeNote: body.changeNote || (changedPaths.length > 0 ? `Updated ${changedPaths.length} field(s)` : 'Manual edit'),
    };
    await repos.briefs.createVersion(campaignId, creatorId, versionSnapshot);

    const updated = await repos.briefs.update(campaignId, creatorId, body.version, {
      content: body.content,
      editedFields: newEditedFields,
      currentVersion: newVersionNum,
    });

    await repos.activity.log({
      campaignId,
      actorEmail: req.user!.email,
      action: 'BRIEF_UPDATED',
      entityType: 'creatorBrief',
      entityId: creatorId,
      summary: `Updated brief content for ${creatorId} (created v${newVersionNum})`,
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/campaigns/:id/briefs/:creatorId/status - Update brief review/approval status
briefRouter.patch('/:creatorId/status', requireCampaignAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const campaignId = req.params.id;
    const creatorId = req.params.creatorId;
    const body = PatchBriefStatusInputSchema.parse(req.body);
    const repos = getRepositories();

    const updated = await repos.briefs.update(campaignId, creatorId, body.version, {
      status: body.status,
    });

    await repos.activity.log({
      campaignId,
      actorEmail: req.user!.email,
      action: 'BRIEF_STATUS_CHANGED',
      entityType: 'creatorBrief',
      entityId: creatorId,
      summary: `Changed brief status to ${body.status.toUpperCase()} for ${creatorId}`,
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/campaigns/:id/briefs/:creatorId - Delete brief
briefRouter.delete('/:creatorId', requireCampaignAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const campaignId = req.params.id;
    const creatorId = req.params.creatorId;
    const repos = getRepositories();

    await repos.briefs.delete(campaignId, creatorId);

    await repos.activity.log({
      campaignId,
      actorEmail: req.user!.email,
      action: 'BRIEF_DELETED',
      entityType: 'creatorBrief',
      entityId: creatorId,
      summary: `Deleted brief for creator ${creatorId}`,
    });

    res.json({ message: 'Brief deleted successfully', creatorId });
  } catch (err) {
    next(err);
  }
});
