import { Request, Response, NextFunction } from 'express';
import { getRepositories } from '../repositories/index.ts';
import { AppError } from '../errors/AppError.ts';
import { Campaign } from '../../shared/types.ts';
import { DEMO_CAMPAIGN, DEMO_CAMPAIGN_ID } from '../fixtures/demoData.ts';

// Extend Request with Campaign
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      campaign?: Campaign;
    }
  }
}

/**
 * Ensures campaign exists and user is owner OR member.
 * If not, returns 404 to avoid leaking existence of private campaigns.
 */
export async function requireCampaignAccess(req: Request, res: Response, next: NextFunction) {
  const campaignId = req.params.id || req.params.campaignId;
  if (!campaignId) {
    return next(AppError.validation('Campaign ID is required in URL'));
  }

  const user = req.user;
  if (!user) {
    return next(AppError.unauthenticated());
  }

  const repos = getRepositories();
  let campaign = await repos.campaigns.getById(campaignId);

  if (!campaign && campaignId === DEMO_CAMPAIGN_ID) {
    campaign = DEMO_CAMPAIGN;
  }

  if (!campaign) {
    return next(AppError.notFound('Campaign not found'));
  }

  const isDemo = campaign.id === DEMO_CAMPAIGN_ID;
  const isOwner = campaign.ownerId === user.uid || campaign.ownerEmail.toLowerCase() === user.email.toLowerCase();
  const isMember = campaign.memberEmails?.some((m) => m.toLowerCase() === user.email.toLowerCase());

  if (!isDemo && !isOwner && !isMember) {
    // Return 404 per specification: never reveal that the campaign exists
    return next(AppError.notFound('Campaign not found'));
  }

  req.campaign = campaign;
  next();
}

/**
 * Requires user to be the owner of the campaign.
 */
export function requireCampaignOwner(req: Request, res: Response, next: NextFunction) {
  const campaign = req.campaign;
  const user = req.user;

  if (!campaign || !user) {
    return next(AppError.unauthenticated());
  }

  const isOwner = campaign.ownerId === user.uid || campaign.ownerEmail.toLowerCase() === user.email.toLowerCase();
  if (!isOwner) {
    return next(AppError.forbidden('Only the campaign owner can perform this action'));
  }

  next();
}
