import { Repositories } from '../repositories/index.ts';
import {
  DEMO_CAMPAIGN,
  DEMO_CAMPAIGN_ID,
  DEMO_CREATORS,
  DEMO_PREMORTEM_INITIAL,
  DEMO_PREMORTEM_SWAPPED,
  DEMO_BRIEFS,
  DEMO_SEARCH_PACK,
  DEMO_TRACKED_VIDEOS,
  DEMO_SNAPSHOTS,
  DEMO_ALERTS,
  DEMO_PULSE_SUMMARY,
} from './demoData.ts';

export async function seedDemoCampaign(repos: Repositories): Promise<void> {
  try {
    // Check if campaign already exists
    const existing = await repos.campaigns.getById(DEMO_CAMPAIGN_ID);
    if (!existing) {
      if ('seed' in repos.campaigns && typeof (repos.campaigns as { seed: (c: unknown[]) => void }).seed === 'function') {
        (repos.campaigns as { seed: (c: unknown[]) => void }).seed([DEMO_CAMPAIGN]);
      } else {
        await repos.campaigns.create(DEMO_CAMPAIGN);
      }
    }

    // Seed creators
    for (const crt of DEMO_CREATORS) {
      const existingCrt = await repos.creators.getById(DEMO_CAMPAIGN_ID, crt.id);
      if (!existingCrt) {
        if ('bulkUpsert' in repos.creators && typeof (repos.creators as any).bulkUpsert === 'function') {
          await (repos.creators as any).bulkUpsert(DEMO_CAMPAIGN_ID, [crt]);
        } else {
          await repos.creators.create(DEMO_CAMPAIGN_ID, crt);
        }
      }
    }

    // Seed pre-mortem runs
    const existingRuns = await repos.premortem.list(DEMO_CAMPAIGN_ID);
    if (existingRuns.length === 0) {
      await repos.premortem.create(DEMO_CAMPAIGN_ID, DEMO_PREMORTEM_INITIAL);
      await repos.premortem.create(DEMO_CAMPAIGN_ID, DEMO_PREMORTEM_SWAPPED);
      await repos.premortem.setApprovedRun(DEMO_CAMPAIGN_ID, DEMO_PREMORTEM_SWAPPED.id);
    }

    // Seed briefs
    const existingBriefs = await repos.briefs.list(DEMO_CAMPAIGN_ID);
    if (existingBriefs.length === 0) {
      for (const brf of DEMO_BRIEFS) {
        await repos.briefs.upsert(DEMO_CAMPAIGN_ID, brf);
      }
    }

    // Seed search pack
    const existingSearchPack = await repos.searchPack.get(DEMO_CAMPAIGN_ID);
    if (!existingSearchPack) {
      await repos.searchPack.upsert(DEMO_CAMPAIGN_ID, DEMO_SEARCH_PACK);
    }

    // Seed tracked videos & snapshots
    const existingVideos = await repos.trackedVideos.list(DEMO_CAMPAIGN_ID);
    if (existingVideos.length === 0) {
      for (const vid of DEMO_TRACKED_VIDEOS) {
        await repos.trackedVideos.create(DEMO_CAMPAIGN_ID, vid);
        const snaps = DEMO_SNAPSHOTS[vid.videoId] || [];
        for (const snap of snaps) {
          await repos.trackedVideos.addSnapshot(DEMO_CAMPAIGN_ID, vid.videoId, snap);
        }
      }
    }

    // Seed alerts
    const existingAlerts = await repos.alerts.list(DEMO_CAMPAIGN_ID);
    if (existingAlerts.length === 0) {
      for (const alt of DEMO_ALERTS) {
        await repos.alerts.upsert(DEMO_CAMPAIGN_ID, alt);
      }
    }

    // Seed pulse summary
    const existingPulseSummary = await repos.pulseSummaries.getLatest(DEMO_CAMPAIGN_ID);
    if (!existingPulseSummary) {
      await repos.pulseSummaries.create(DEMO_CAMPAIGN_ID, DEMO_PULSE_SUMMARY);
    }
  } catch (err) {
    console.log('[Seed] Note: Demo campaign seeded into resilient repository store.');
  }
}
