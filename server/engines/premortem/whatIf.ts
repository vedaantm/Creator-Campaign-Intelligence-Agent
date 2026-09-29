import { CONFIG } from '../../../shared/config.ts';
import {
  CampaignBrief,
  Creator,
  WhatIfResponse,
  PairwiseOverlapResult,
  LineupMetrics,
  LineupCreatorMetrics,
} from '../../../shared/types.ts';
import { AppError } from '../../errors/AppError.ts';
import { getRepositories } from '../../repositories/index.ts';
import {
  computePairOverlap,
  computeOverlapAdjustedReach,
  computeLineupBudgetMetrics,
} from './signals.ts';
import { calculateHealthScore } from './healthScore.ts';

/**
 * Synchronous recomputation of health score, penalties, reach, and budget
 * from stored creator data ONLY (no external AI or YouTube API calls).
 */
export async function executeWhatIf(
  campaignId: string,
  creatorIds: string[]
): Promise<WhatIfResponse> {
  const repos = getRepositories();

  if (creatorIds.length < 1 || creatorIds.length > CONFIG.PREMORTEM_MAX_CREATORS) {
    throw AppError.validation(`What-If simulation requires between 1 and ${CONFIG.PREMORTEM_MAX_CREATORS} creators`);
  }

  const campaign = await repos.campaigns.getById(campaignId);
  if (!campaign) throw AppError.notFound('Campaign not found');

  const brief = campaign.brief as CampaignBrief;
  const budgetUsd = brief?.budgetUsd || 10000;

  const allCreators = await repos.creators.list(campaignId);
  const creatorMap = new Map(allCreators.map((c) => [c.id, c]));

  const lineupCreators: Creator[] = [];
  const creatorsNeedingData: string[] = [];

  for (const id of creatorIds) {
    const c = creatorMap.get(id);
    if (!c) {
      throw AppError.notFound(`Creator ${id} not found in campaign`);
    }
    lineupCreators.push(c);

    // Check if creator lacks comment data
    if (!c.commentSample || c.commentSample.authorChannelIds.length === 0) {
      creatorsNeedingData.push(id);
    }
  }

  // Compute pairwise overlaps
  const pairwiseResults: PairwiseOverlapResult[] = [];
  for (let i = 0; i < lineupCreators.length; i++) {
    for (let j = i + 1; j < lineupCreators.length; j++) {
      const cA = lineupCreators[i];
      const cB = lineupCreators[j];

      const pair = computePairOverlap(
        { id: cA.id, name: cA.channel?.title || cA.normalizedKey },
        { id: cB.id, name: cB.channel?.title || cB.normalizedKey },
        {
          commentersA: cA.commentSample?.authorChannelIds || [],
          commentersB: cB.commentSample?.authorChannelIds || [],
          embeddingA: cA.embeddingCache?.vector || null,
          embeddingB: cB.embeddingCache?.vector || null,
          tagsA: [...(cA.tags || []), ...(cA.channel?.topicCategories || [])],
          tagsB: [...(cB.tags || []), ...(cB.channel?.topicCategories || [])],
          videosCountA: cA.recentVideos?.length || 0,
          videosCountB: cB.recentVideos?.length || 0,
        }
      );
      pairwiseResults.push(pair);
    }
  }

  // Reach & budget metrics
  const creatorMedians = lineupCreators.map((c) => ({
    id: c.id,
    medianViews: c.metrics?.longForm?.medianViews || c.metrics?.shorts?.medianViews || 1000,
  }));

  const reachMetrics = computeOverlapAdjustedReach(creatorMedians, pairwiseResults);
  const budgetMetrics = computeLineupBudgetMetrics(
    lineupCreators.map((c) => ({ id: c.id, metrics: c.metrics })),
    budgetUsd
  );

  const creatorMetrics: Record<string, LineupCreatorMetrics> = {};
  const sixtyDaysAgoMs = Date.now() - 60 * 86400000;

  for (const c of lineupCreators) {
    const name = c.channel?.title || c.normalizedKey;
    const sponsored = (c.recentVideos || []).filter((v) => v.hasSponsorshipSignals);
    const classified = c.classifiedSponsors || [];

    let recentCategoryCount = 0;
    let recentCompetitorCount = 0;

    for (const s of classified) {
      const vid = c.recentVideos?.find((v) => v.videoId === s.videoId);
      const isRecent = vid?.publishedAt ? new Date(vid.publishedAt).getTime() > sixtyDaysAgoMs : true;
      if (s.sameCategoryAsOurProduct && isRecent) recentCategoryCount++;
      if (s.isCompetitor && isRecent) recentCompetitorCount++;
    }

    const midpoint = c.metrics
      ? (c.metrics.estimatedCostPerVideoUsd.low + c.metrics.estimatedCostPerVideoUsd.high) / 2
      : 0;

    const costShare = budgetMetrics.totalCostMidpoint > 0 ? midpoint / budgetMetrics.totalCostMidpoint : 0;

    creatorMetrics[c.id] = {
      creatorId: c.id,
      channelTitle: name,
      sponsoredVideosCount: sponsored.length,
      recentCategorySponsoredCount: recentCategoryCount,
      recentCompetitorSponsoredCount: recentCompetitorCount,
      recentCategoryShare: sponsored.length > 0 ? recentCategoryCount / sponsored.length : 0,
      negativeShare: c.sentimentStats?.negativeShare || 0,
      adFatigueShare: c.sentimentStats?.adFatigueShare || 0,
      sentimentMethod: c.sentimentStats?.method || 'gemini',
      medianViews: c.metrics?.longForm?.medianViews || c.metrics?.shorts?.medianViews || 0,
      estimatedCostMidpoint: midpoint,
      costShare: Math.round(costShare * 1000) / 1000,
      hasSufficientCommentData: Boolean(c.commentSample && c.commentSample.authorChannelIds.length >= 30),
    };
  }

  const lineupMetrics: LineupMetrics = {
    ...reachMetrics,
    ...budgetMetrics,
    budgetUsd,
    creatorMetrics,
  };

  const healthResult = calculateHealthScore({
    creators: lineupCreators,
    pairwiseResults,
    lineupMetrics,
    budgetUsd,
  });

  return {
    lineupCreatorIds: creatorIds,
    healthScore: healthResult.healthScore,
    label: healthResult.label,
    confidence: healthResult.confidence,
    penalties: healthResult.penalties,
    lineupMetrics,
    pairwiseResults,
    creatorsNeedingData,
  };
}
