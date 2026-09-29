import { randomUUID } from 'node:crypto';
import { Campaign, SearchPack } from '../../shared/types.ts';

export interface PushCampaignResult {
  success: boolean;
  simulatedPayload: Record<string, unknown>;
  operationId: string;
  pushedAt: string;
  pushedBy: string;
  bannerNotice: string;
}

export interface AdsProvider {
  pushCampaign(params: {
    campaign: Campaign;
    searchPack: SearchPack;
    userEmail: string;
  }): Promise<PushCampaignResult>;
}

export class SimulatedAdsProvider implements AdsProvider {
  async pushCampaign(params: {
    campaign: Campaign;
    searchPack: SearchPack;
    userEmail: string;
  }): Promise<PushCampaignResult> {
    const { campaign, searchPack, userEmail } = params;
    const now = new Date().toISOString();
    const operationId = `op_sim_ads_${randomUUID().slice(0, 8)}`;

    const content = searchPack.content || {
      highIntentQueries: [],
      titleFormulas: [],
      thumbnailHooks: [],
      searchDescriptionTemplate: '',
      recommendedTags: [],
      creatorGuidelines: '',
    };

    const totalBudget = 3500; // Simulated total budget
    const avgDailyBudgetMicros = Math.round((250) * 1_000_000);

    // Illustrative Performance Max / AI Max campaign creation request matching Google Ads API v16 structure
    const simulatedPayload: Record<string, unknown> = {
      _disclaimer:
        'SIMULATED GOOGLE ADS API PAYLOAD — No real live ads campaign created. Requires approved developer token and OAuth.',
      customerId: '123-456-7890',
      operations: [
        {
          campaignBudgetOperation: {
            create: {
              resourceName: `customers/1234567890/campaignBudgets/-1`,
              name: `Budget - ${campaign.name} - Launch Capture`,
              amountMicros: avgDailyBudgetMicros,
              deliveryMethod: 'STANDARD',
              explicitlyShared: false,
            },
          },
        },
        {
          campaignOperation: {
            create: {
              resourceName: `customers/1234567890/campaigns/-2`,
              name: `AI Max - ${campaign.name}`,
              status: 'PAUSED', // Always safety paused initially
              advertisingChannelType: 'PERFORMANCE_MAX',
              campaignBudget: `customers/1234567890/campaignBudgets/-1`,
              biddingStrategyType: 'TARGET_CPA',
              targetCpa: {
                targetCpaMicros: 22_500_000,
              },
              urlExpansionOptOut: false,
            },
          },
        },
        {
          assetGroupOperation: {
            create: {
              resourceName: `customers/1234567890/assetGroups/-3`,
              campaign: `customers/1234567890/campaigns/-2`,
              name: `Asset Group - Creator Synergy`,
              status: 'ENABLED',
              headlines: content.highIntentQueries.map((q) => ({ text: q.query })),
              descriptions: [content.searchDescriptionTemplate].filter(Boolean).map((text) => ({ text })),
              businessName: campaign.name || 'Brand',
            },
          },
        },
        {
          assetGroupSignalOperation: {
            create: {
              assetGroup: `customers/1234567890/assetGroups/-3`,
              searchThemes: content.recommendedTags.map((tag) => ({ text: tag })),
            },
          },
        },
      ],
      metadata: {
        totalQueries: content.highIntentQueries.length,
        totalSearchBudgetUsd: totalBudget,
      },
    };

    return {
      success: true,
      simulatedPayload,
      operationId,
      pushedAt: now,
      pushedBy: userEmail,
      bannerNotice:
        'SIMULATED: Creating live campaigns through the Google Ads API requires an approved developer token, OAuth, and a production Google Ads account. This simulated push records the exact formatted payload structure.',
    };
  }
}

export const adsProvider: AdsProvider = new SimulatedAdsProvider();
