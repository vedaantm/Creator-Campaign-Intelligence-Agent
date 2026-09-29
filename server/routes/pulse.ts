import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import {
  AddTrackedVideoInputSchema,
  TrackedVideo,
  Alert,
} from '../../shared/types.ts';
import { CONFIG } from '../../shared/config.ts';
import { getRepositories } from '../repositories/index.ts';
import { requireCampaignAccess } from '../middleware/campaignAuth.ts';
import { AppError } from '../errors/AppError.ts';
import { fetchVideosByIds, getCommentSample, getQuotaUsageToday } from '../services/youtube.ts';
import { evaluateVideoAlerts, reconcileAlerts } from '../engines/pulse/alerts.ts';
import { classifyCommentsList } from '../engines/pulse/sentiment.ts';
import { calculateSimulatedSearchMetrics } from '../engines/pulse/simulatedAds.ts';
import { generatePulseAiSummary } from '../engines/pulse/summary.ts';

export const pulseRouter = Router({ mergeParams: true });

function extractVideoId(urlOrId: string): string | null {
  const trimmed = urlOrId.trim();
  if (/^[a-zA-Z0-9_-]{8,20}$/.test(trimmed)) {
    return trimmed;
  }
  const match = trimmed.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{8,20})/i);
  return match ? match[1] : null;
}

// GET /api/v1/campaigns/:id/live/videos - List tracked videos
pulseRouter.get('/videos', requireCampaignAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const campaignId = req.params.id;
    const repos = getRepositories();
    const videos = await repos.trackedVideos.list(campaignId);
    res.json(videos);
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/campaigns/:id/live/videos - Add tracked video
pulseRouter.post('/videos', requireCampaignAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const campaignId = req.params.id;
    const parseResult = AddTrackedVideoInputSchema.safeParse(req.body);

    if (!parseResult.success) {
      const details = parseResult.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
      throw AppError.validation('Invalid video input data', details);
    }

    const { urlOrId, creatorId, isStandIn, allowSecond } = parseResult.data;
    const videoId = extractVideoId(urlOrId);

    if (!videoId) {
      throw AppError.validation('Invalid YouTube URL or Video ID format.');
    }

    const repos = getRepositories();

    // Check creator exists
    const creator = await repos.creators.getById(campaignId, creatorId);
    if (!creator) {
      throw AppError.notFound(`Creator ${creatorId} not found in campaign.`);
    }

    // Check one tracked video rule per creator unless allowSecond is true
    const existingVideos = await repos.trackedVideos.list(campaignId);
    const creatorExisting = existingVideos.filter((v) => v.creatorId === creatorId);
    if (creatorExisting.length > 0 && !allowSecond) {
      throw AppError.unprocessable(
        `Creator ${creator.channel?.title || creator.input || creatorId} already has a tracked video. Pass allowSecond: true to confirm adding an additional video.`
      );
    }

    // Fetch video details from YouTube
    const rawVideos = await fetchVideosByIds([videoId]);
    const rawVideo = rawVideos[0];

    if (!rawVideo || (rawVideo as any).privacyStatus === 'private') {
      throw AppError.unprocessable('Video not found, deleted, or set to private on YouTube.');
    }

    // Validate channel ownership unless marked as stand-in video
    if (!isStandIn && creator.channel?.channelId && rawVideo.channelId) {
      if (creator.channel.channelId !== rawVideo.channelId) {
        throw AppError.unprocessable(
          `Video channel (${rawVideo.channelId}) does not match creator's channel (${creator.channel.channelId}). Set isStandIn: true if this is an intentional stand-in video.`
        );
      }
    }

    const now = new Date().toISOString();
    const stats = {
      views: rawVideo.viewCount || 0,
      likes: rawVideo.likeCount || 0,
      comments: rawVideo.commentCount || 0,
    };

    const trackedVideo: TrackedVideo = {
      id: videoId,
      campaignId,
      creatorId,
      videoId,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      title: rawVideo.title || 'Tracked Video',
      publishedAt: rawVideo.publishedAt || now,
      isStandIn: !!isStandIn,
      active: true,
      lastPolledAt: now,
      lastCommentPollAt: null,
      latestStats: stats,
      commentsUnavailable: false,
      createdAt: now,
    };

    // Save tracked video and initial snapshot
    await repos.trackedVideos.create(campaignId, trackedVideo);
    await repos.trackedVideos.addSnapshot(campaignId, videoId, {
      at: now,
      views: stats.views,
      likes: stats.likes,
      comments: stats.comments,
    });

    // Evaluate initial alerts
    const creatorMedianViews = creator.metrics?.longForm?.medianViews || creator.metrics?.shorts?.medianViews || 10000;
    const creatorMedianEng = creator.metrics?.longForm?.medianEngagementRate || creator.metrics?.shorts?.medianEngagementRate || 0.03;

    const firing = evaluateVideoAlerts(trackedVideo, creatorMedianViews, creatorMedianEng, rawVideo.description, now);
    const existingActiveAlerts = await repos.alerts.list(campaignId, { active: true });
    const reconciled = reconcileAlerts(campaignId, existingActiveAlerts, firing, now);

    for (const a of reconciled) {
      await repos.alerts.upsert(campaignId, a);
    }

    res.status(201).json(trackedVideo);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/campaigns/:id/live/videos/:videoId - Update video status
pulseRouter.patch('/videos/:videoId', requireCampaignAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: campaignId, videoId } = req.params;
    const repos = getRepositories();
    const updated = await repos.trackedVideos.update(campaignId, videoId, req.body);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/campaigns/:id/live/videos/:videoId - Delete tracked video
pulseRouter.delete('/videos/:videoId', requireCampaignAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: campaignId, videoId } = req.params;
    const repos = getRepositories();
    await repos.trackedVideos.delete(campaignId, videoId);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/campaigns/:id/live/poll - Refresh metrics for active tracked videos
pulseRouter.post('/poll', requireCampaignAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const campaignId = req.params.id;
    const repos = getRepositories();

    // Check YouTube Quota Warning
    const currentQuota = getQuotaUsageToday();
    const quotaThreshold = CONFIG.YOUTUBE_DAILY_QUOTA_UNITS * CONFIG.YOUTUBE_QUOTA_WARNING_RATIO;
    if (currentQuota >= quotaThreshold) {
      res.status(429).json({
        paused: true,
        reason: `YouTube API quota limit (80%) approached for today (${currentQuota}/${CONFIG.YOUTUBE_DAILY_QUOTA_UNITS}). Polling paused to prevent quota exhaustion.`,
      });
      return;
    }

    const videos = await repos.trackedVideos.list(campaignId);
    const activeVideos = videos.filter((v) => v.active);

    const now = new Date();
    const nowISO = now.toISOString();

    // Check poll interval enforcement across campaign
    let newestPollTime = 0;
    for (const v of activeVideos) {
      if (v.lastPolledAt) {
        const t = new Date(v.lastPolledAt).getTime();
        if (t > newestPollTime) newestPollTime = t;
      }
    }

    const minIntervalMs = CONFIG.LIVE_POLL_MINIMUM_MINUTES * 60 * 1000;
    const pollIntervalMs = CONFIG.LIVE_POLL_MINUTES * 60 * 1000;

    if (newestPollTime > 0 && now.getTime() - newestPollTime < minIntervalMs) {
      const nextPollAt = new Date(newestPollTime + pollIntervalMs).toISOString();
      const existingAlerts = await repos.alerts.list(campaignId);
      res.json({
        skipped: true,
        reason: `Poll interval active. Next poll scheduled at ${nextPollAt}`,
        lastPolledAt: new Date(newestPollTime).toISOString(),
        nextPollAt,
        videos,
        alerts: existingAlerts,
      });
      return;
    }

    // Perform batched YouTube videos.list call
    const activeIds = activeVideos.map((v) => v.videoId);
    const fetchedRaw = await fetchVideosByIds(activeIds);
    const rawMap = new Map(fetchedRaw.map((r) => [r.videoId, r]));

    const creators = await repos.creators.list(campaignId);
    const creatorMap = new Map(creators.map((c) => [c.id, c]));

    const allFiringAlerts = [];

    for (const video of activeVideos) {
      const raw = rawMap.get(video.videoId);
      if (!raw) continue;

      const newStats = {
        views: raw.viewCount || video.latestStats?.views || 0,
        likes: raw.likeCount || video.latestStats?.likes || 0,
        comments: raw.commentCount || video.latestStats?.comments || 0,
      };

      let sentiment = video.sentiment;
      let lastCommentPollAt = video.lastCommentPollAt;
      let commentsUnavailable = video.commentsUnavailable;

      // Check comment poll interval (60 minutes)
      const commentIntervalMs = CONFIG.LIVE_COMMENT_POLL_MINUTES * 60 * 1000;
      const lastCommentTime = lastCommentPollAt ? new Date(lastCommentPollAt).getTime() : 0;

      if (!lastCommentTime || now.getTime() - lastCommentTime >= commentIntervalMs) {
        const commentSample = await getCommentSample(video.videoId, 50);
        lastCommentPollAt = nowISO;

        if (commentSample.unavailable) {
          commentsUnavailable = true;
        } else if (commentSample.comments.length > 0) {
          commentsUnavailable = false;
          sentiment = classifyCommentsList(commentSample.comments);
        }
      }

      // Update tracked video document
      const updatedVideo: TrackedVideo = {
        ...video,
        latestStats: newStats,
        sentiment,
        lastPolledAt: nowISO,
        lastCommentPollAt,
        commentsUnavailable,
      };

      await repos.trackedVideos.update(campaignId, video.videoId, updatedVideo);
      await repos.trackedVideos.addSnapshot(campaignId, video.videoId, {
        at: nowISO,
        views: newStats.views,
        likes: newStats.likes,
        comments: newStats.comments,
      });

      // Evaluate alerts for updated video
      const creator = creatorMap.get(video.creatorId);
      const medianViews = creator?.metrics?.longForm?.medianViews || creator?.metrics?.shorts?.medianViews || 10000;
      const medianEng = creator?.metrics?.longForm?.medianEngagementRate || creator?.metrics?.shorts?.medianEngagementRate || 0.03;

      const videoFiring = evaluateVideoAlerts(updatedVideo, medianViews, medianEng, raw.description, nowISO);
      allFiringAlerts.push(...videoFiring);
    }

    // Reconcile and save alerts
    const existingActiveAlerts = await repos.alerts.list(campaignId, { active: true });
    const reconciledAlerts = reconcileAlerts(campaignId, existingActiveAlerts, allFiringAlerts, nowISO);

    for (const a of reconciledAlerts) {
      await repos.alerts.upsert(campaignId, a);
    }

    const updatedVideos = await repos.trackedVideos.list(campaignId);
    const updatedAlerts = await repos.alerts.list(campaignId);
    const nextPollAt = new Date(now.getTime() + pollIntervalMs).toISOString();

    res.json({
      skipped: false,
      lastPolledAt: nowISO,
      nextPollAt,
      videos: updatedVideos,
      alerts: updatedAlerts,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/campaigns/:id/live/videos/:videoId/snapshots - Get video snapshots history
pulseRouter.get('/videos/:videoId/snapshots', requireCampaignAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: campaignId, videoId } = req.params;
    const { from, to } = req.query;
    const repos = getRepositories();
    const snapshots = await repos.trackedVideos.getSnapshots(
      campaignId,
      videoId,
      from ? String(from) : undefined,
      to ? String(to) : undefined
    );
    res.json(snapshots);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/campaigns/:id/live/alerts - List alerts with filters
pulseRouter.get('/alerts', requireCampaignAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const campaignId = req.params.id;
    const { acknowledged, active } = req.query;
    const repos = getRepositories();

    const filters: { acknowledged?: boolean; active?: boolean } = {};
    if (acknowledged !== undefined) filters.acknowledged = acknowledged === 'true';
    if (active !== undefined) filters.active = active === 'true';

    const alerts = await repos.alerts.list(campaignId, filters);
    res.json(alerts);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/campaigns/:id/live/alerts/:alertId - Update alert acknowledgement
pulseRouter.patch('/alerts/:alertId', requireCampaignAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: campaignId, alertId } = req.params;
    const { acknowledged } = req.body;

    const repos = getRepositories();
    const updated = await repos.alerts.update(campaignId, alertId, {
      acknowledged: !!acknowledged,
      acknowledgedBy: acknowledged ? req.user?.email || 'user' : null,
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/campaigns/:id/live/summary - Generate AI summary
pulseRouter.post('/summary', requireCampaignAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const campaignId = req.params.id;
    const { force } = req.body || {};
    const repos = getRepositories();

    // Check 30 minute summary cooldown unless force is true
    const latestSummary = await repos.pulseSummaries.getLatest(campaignId);
    if (!force && latestSummary) {
      const cooldownMs = CONFIG.LIVE_SUMMARY_COOLDOWN_MINUTES * 60 * 1000;
      const elapsed = Date.now() - new Date(latestSummary.createdAt).getTime();
      if (elapsed < cooldownMs) {
        res.json(latestSummary);
        return;
      }
    }

    const campaign = await repos.campaigns.getById(campaignId);
    const trackedVideos = await repos.trackedVideos.list(campaignId);
    const activeAlerts = await repos.alerts.list(campaignId, { active: true });
    const simulatedMetrics = calculateSimulatedSearchMetrics(trackedVideos);

    const newSummary = await generatePulseAiSummary(
      campaignId,
      campaign?.name || 'Campaign',
      trackedVideos,
      activeAlerts,
      simulatedMetrics
    );

    await repos.pulseSummaries.create(campaignId, newSummary);
    res.status(201).json(newSummary);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/campaigns/:id/live/summary/latest - Get latest summary
pulseRouter.get('/summary/latest', requireCampaignAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const campaignId = req.params.id;
    const repos = getRepositories();
    const summary = await repos.pulseSummaries.getLatest(campaignId);
    if (!summary) {
      throw AppError.notFound(`No pulse summary found for campaign ${campaignId}`);
    }
    res.json(summary);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/campaigns/:id/live/simulated-search - Get simulated search metrics
pulseRouter.get('/simulated-search', requireCampaignAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const campaignId = req.params.id;
    const repos = getRepositories();
    const trackedVideos = await repos.trackedVideos.list(campaignId);
    const metrics = calculateSimulatedSearchMetrics(trackedVideos);
    res.json(metrics);
  } catch (err) {
    next(err);
  }
});
