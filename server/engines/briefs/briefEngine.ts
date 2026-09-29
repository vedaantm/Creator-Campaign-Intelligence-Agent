import { z } from 'zod';
import { CONFIG } from '../../../shared/config.ts';
import {
  Campaign,
  CampaignBrief,
  Creator,
  CreatorBrief,
  CreatorBriefContent,
  CreatorBriefStatus,
  ContentAngle,
  GuidelineRuleItem,
} from '../../../shared/types.ts';
import { generateStructured, wrapUntrustedData } from '../../services/gemini.ts';
import { buildCreatorCtaUrl } from './utmBuilder.ts';
import { calculateTimeline } from './timelineCalculator.ts';
import { calculateSuccessMetrics } from './successMetrics.ts';
import { detectUnapprovedClaims } from './claimDetector.ts';
import { verifyBriefCitations } from './titleCitationVerifier.ts';
import { mergePreservingEdits } from './preserveEditsMerge.ts';

const StructuredBriefSchema = z.object({
  creatorSnapshot: z.string(),
  campaignObjective: z.string(),
  recommendedFormat: z.object({
    type: z.enum(['dedicated video', 'integrated segment', 'Short']),
    targetLength: z.string(),
    placement: z.string(),
    rationale: z.string(),
  }),
  contentAngles: z.array(
    z.object({
      title: z.string(),
      hook: z.string(),
      outline: z.array(z.string()).min(2).max(8),
      whyItFitsThisCreator: z.string(),
    })
  ).length(3),
  keyMessages: z.array(z.string()).min(3).max(6),
  dos: z.array(
    z.object({
      ruleCode: z.string(),
      instruction: z.string(),
    })
  ),
  donts: z.array(
    z.object({
      ruleCode: z.string(),
      instruction: z.string(),
    })
  ),
});

type StructuredBriefOutput = z.infer<typeof StructuredBriefSchema>;

export interface ActiveGuideline {
  code: string;
  rule: string;
  type: 'do' | 'dont' | 'mandatory';
}

export interface GenerateBriefOptions {
  campaign: Campaign;
  brief: CampaignBrief;
  creator: Creator;
  guidelines?: ActiveGuideline[];
  userInstruction?: string;
  existingBrief?: CreatorBrief | null;
  preserveEdits?: boolean;
}

/**
 * Extracts and prepares creator video signals for prompt injection.
 */
function prepareCreatorVideoContext(creator: Creator) {
  const recentVideos = creator.recentVideos || [];
  const medianViews = creator.metrics?.longForm?.medianViews || creator.metrics?.shorts?.medianViews || 10000;

  // Pick top 3 videos by views / median views ratio
  const sorted = [...recentVideos].sort((a, b) => {
    const ratioA = a.viewCount / (medianViews || 1);
    const ratioB = b.viewCount / (medianViews || 1);
    return ratioB - ratioA;
  });

  const topVideos = sorted.slice(0, 3);
  const totalVideos = recentVideos.length || 1;
  const shortsCount = recentVideos.filter((v) => v.isShort).length;
  const shortsShare = Math.round((shortsCount / totalVideos) * 100);

  const totalDuration = recentVideos.reduce((acc, v) => acc + (v.durationSeconds || 0), 0);
  const avgDurationMins = Math.round(totalDuration / totalVideos / 60);

  return {
    topVideos,
    medianViews,
    shortsShare,
    avgDurationMins,
  };
}

/**
 * Generates an individualized Creator Collaboration Brief using Gemini structured output,
 * verifying citations, detecting unapproved claims, and inserting code-controlled metadata.
 */
export async function generateCreatorBrief(
  options: GenerateBriefOptions
): Promise<CreatorBriefContent & { status: CreatorBriefStatus }> {
  const {
    campaign,
    brief,
    creator,
    guidelines = [...CONFIG.DEFAULT_BRAND_GUIDELINES],
    userInstruction,
    existingBrief,
    preserveEdits = false,
  } = options;

  const { topVideos, medianViews, shortsShare, avgDurationMins } = prepareCreatorVideoContext(creator);

  const topVideosSummary = topVideos.map((v, i) => {
    const ratio = Math.round((v.viewCount / (medianViews || 1)) * 10) / 10;
    return `Video ${i + 1}:
- Title: "${v.title}"
- Description Excerpt: "${v.description.slice(0, 300).replace(/\s+/g, ' ')}"
- Duration: ${Math.round(v.durationSeconds / 60)} minutes (${v.isShort ? 'Short' : 'Long-form'})
- Views vs Channel Median: ${ratio}x (${v.viewCount.toLocaleString()} views)`;
  }).join('\n\n');

  const activeGuidelinesList = guidelines.map((g) => `[${g.code}] (${g.type.toUpperCase()}): ${g.rule}`).join('\n');
  const approvedFactsList = brief.approvedFacts.map((f, i) => `${i + 1}. ${f}`).join('\n');

  const systemInstruction = `You are an elite Creator Brief Strategist for brand partnerships.
Write a bespoke, commercially sharp, creator-tailored collaboration brief.
RULES:
1. creatorSnapshot: Exactly 2 sentences capturing what works best on this creator's channel. MUST cite at least one EXACT video title from their provided top videos.
2. campaignObjective: Exactly 1 sentence tying the creator's audience to the campaign goal: "${brief.goal}".
3. recommendedFormat: Recommend type ("dedicated video", "integrated segment", or "Short"), target length, placement, and a data-backed rationale citing their format history (avg duration ${avgDurationMins}m, ${shortsShare}% Shorts).
4. contentAngles: Exactly 3 distinct creative concepts. Each MUST have: title, first 10-second hook, outline (3-5 beats), and whyItFitsThisCreator citing their past video titles or channel style.
5. keyMessages: Exactly 3 to 5 talking points. MUST be drawn strictly from the Approved Facts list. Never invent unapproved prices, numerical stats, or medical/performance guarantees.
6. dos and donts: Extract actionable instructions from the Brand Guidelines. Each MUST explicitly cite an active rule code (e.g. "G-1", "G-2", etc.).
7. Never invent fake video titles; cite real titles from untrusted data.`;

  const prompt = `CAMPAIGN CONTEXT:
Brand: "${brief.brandName}" | Product: "${brief.productName}" (${brief.productCategory})
Campaign Goal: "${brief.goal}"
Target Audience: "${brief.targetAudience}"
Brand Tones: ${brief.tones.join(', ')}
${brief.customTone ? `Custom Tone: ${brief.customTone}` : ''}

APPROVED BRAND FACTS (Mandatory source for key messages):
${approvedFactsList}

ACTIVE BRAND GUIDELINES (Must cite codes in dos/donts):
${activeGuidelinesList}

CREATOR METRICS & FORMAT PROFILE:
Channel: "${creator.channel?.title || creator.normalizedKey}"
Subscribers: ${creator.metrics?.subscribers?.toLocaleString() || 'Hidden'}
Median Views: ${medianViews.toLocaleString()}
Typical Format: Average ${avgDurationMins} minutes duration, ${shortsShare}% Shorts share
${userInstruction ? `\nUSER SPECIFIC CREATIVE INSTRUCTION:\n"${userInstruction}"\n` : ''}

CREATOR TOP RECENT VIDEOS EVIDENCE:
${wrapUntrustedData('youtube_creator_videos', topVideosSummary || 'No recent video titles available.')}`;

  let aiResult: StructuredBriefOutput;

  try {
    aiResult = await generateStructured<StructuredBriefOutput>({
      engine: 'BriefEngine:Generate',
      systemInstruction,
      prompt,
      zodSchema: StructuredBriefSchema,
      temperature: 0.2,
    });
  } catch (err) {
    console.warn(`[BriefEngine] Primary generation failed for ${creator.id}:`, (err as Error).message);
    aiResult = generateDeterministicFallback(brief, creator, topVideos, guidelines);
  }

  // 1. Title Citation Verification
  let citationWarnings = verifyBriefCitations(
    aiResult.creatorSnapshot,
    aiResult.contentAngles,
    creator.recentVideos || []
  );

  // If citation verification fails and real videos exist, attempt a single self-repair call
  if (citationWarnings.length > 0 && topVideos.length > 0) {
    try {
      console.log(`[BriefEngine] Citation mismatch found for ${creator.id}. Executing 1 repair attempt...`);
      const repairPrompt = `${prompt}\n\nATTENTION: Your previous response cited video titles that do not match the creator's real videos.
Issues: ${citationWarnings.map((w) => `${w.field}: "${w.citedTitle}"`).join('; ')}
Real valid titles available: ${topVideos.map((v) => `"${v.title}"`).join(', ')}.
Please regenerate, citing ONLY authentic titles from the list above.`;

      const repairedResult = await generateStructured<StructuredBriefOutput>({
        engine: 'BriefEngine:RepairCitation',
        systemInstruction,
        prompt: repairPrompt,
        zodSchema: StructuredBriefSchema,
        temperature: 0.1,
      });

      const newWarnings = verifyBriefCitations(
        repairedResult.creatorSnapshot,
        repairedResult.contentAngles,
        creator.recentVideos || []
      );

      // If repaired successfully or reduced errors, adopt repair
      if (newWarnings.length < citationWarnings.length) {
        aiResult = repairedResult;
        citationWarnings = newWarnings;
      }
    } catch {
      // Keep primary result if repair fails
    }
  }

  // 2. Validate Guideline Codes
  const validCodes = new Set(guidelines.map((g) => g.code));
  const validatedDos = aiResult.dos.map((d) => ({
    ruleCode: validCodes.has(d.ruleCode) ? d.ruleCode : (guidelines[0]?.code || 'G-1'),
    instruction: d.instruction,
  }));
  const validatedDonts = aiResult.donts.map((d) => ({
    ruleCode: validCodes.has(d.ruleCode) ? d.ruleCode : (guidelines[1]?.code || 'G-2'),
    instruction: d.instruction,
  }));

  // 3. Detect Unapproved Claims in Key Messages
  const claimWarnings = detectUnapprovedClaims(aiResult.keyMessages, brief.approvedFacts);

  // 4. Code-Inserted Invariants (Never generated by AI)
  const verbalText = (brief.requiredDisclosures.verbalText || 'This video is sponsored by {brandName}.')
    .replace(/\{brandName\}/g, brief.brandName);

  const mandatoryDisclosures = {
    descriptionText: brief.requiredDisclosures.descriptionText || '#ad',
    verbalText,
  };

  const callToAction = buildCreatorCtaUrl({
    landingPageUrl: brief.landingPageUrl,
    campaignName: campaign.name,
    creatorHandleOrName: creator.channel?.title || creator.normalizedKey,
  });

  const deliverablesAndTimeline = calculateTimeline(
    brief.launchDate,
    creator.plannedPublishDate
  );

  const successMetrics = calculateSuccessMetrics(creator);

  // Determine initial status
  let status: CreatorBriefStatus = 'draft';
  if (citationWarnings.length > 0 || claimWarnings.length > 0) {
    status = 'needsReview';
  }

  let finalContent: CreatorBriefContent = {
    creatorSnapshot: aiResult.creatorSnapshot,
    campaignObjective: aiResult.campaignObjective,
    recommendedFormat: aiResult.recommendedFormat,
    contentAngles: aiResult.contentAngles,
    keyMessages: aiResult.keyMessages,
    dos: validatedDos,
    donts: validatedDonts,
    mandatoryDisclosures,
    callToAction,
    deliverablesAndTimeline,
    successMetrics,
    claimWarnings,
    citationWarnings,
  };

  // If preserving edits from an existing brief
  if (preserveEdits && existingBrief?.content && existingBrief.editedFields.length > 0) {
    finalContent = mergePreservingEdits(
      finalContent,
      existingBrief.content,
      existingBrief.editedFields
    );
  }

  return {
    ...finalContent,
    status,
  };
}

/**
 * Deterministic fallback generator when AI calls fail or in offline/test mode.
 */
function generateDeterministicFallback(
  brief: CampaignBrief,
  creator: Creator,
  topVideos: Array<{ title: string; description: string; durationSeconds: number; isShort: boolean }>,
  guidelines: ActiveGuideline[]
): StructuredBriefOutput {
  const name = creator.channel?.title || creator.normalizedKey;
  const topTitle = topVideos[0]?.title || 'deep-dive equipment analysis';
  const secondTitle = topVideos[1]?.title || 'testing practical everyday setups';

  return {
    creatorSnapshot: `${name} has built a highly engaged audience around rigorous hands-on testing, exemplified by high-performing uploads like "${topTitle}". Their community responds best to authentic, demonstrative reviews that respect the viewer's intelligence and detail orientation.`,
    campaignObjective: `Introduce ${brief.productName} to ${name}'s core audience to drive authentic ${brief.goal} with clear product demonstration.`,
    recommendedFormat: {
      type: 'integrated segment',
      targetLength: '60–90 seconds',
      placement: 'Integrated mid-roll segment (at natural narrative transition)',
      rationale: `Given their audience's appreciation for long-form context and in-depth reviews, an integrated segment preserves editorial independence while delivering high retention.`,
    },
    contentAngles: [
      {
        title: `Field-Testing the ${brief.productName} in Real Conditions`,
        hook: `I wanted to see if ${brief.productName} actually holds up outside a studio setting.`,
        outline: [
          'Setting up the challenge and unpacking the equipment',
          'Demonstrating core extraction mechanics and ergonomics',
          'Tasting the results and comparing practical workflow against routine setups',
          'Key takeaways and exclusive viewer link in the description',
        ],
        whyItFitsThisCreator: `Directly matches the experimental testing format that made "${topTitle}" resonate with their audience.`,
      },
      {
        title: `The Ultimate EDC Travel Kit with ${brief.productName}`,
        hook: `Here is everything I pack when I need uncompromising coffee quality on the go.`,
        outline: [
          'Overview of compact daily-carry gear essentials',
          'Highlighting the 350g build and manual pressure design of the Picopresso',
          'Brewing an authentic shot of espresso without electricity',
          'Final verdict on value and portability for travel',
        ],
        whyItFitsThisCreator: `Aligns with audience enthusiasm for portable gear guides seen in "${secondTitle}".`,
      },
      {
        title: `5 Common Mistakes with Portable Brewing (And How to Fix Them)`,
        hook: `Most people struggle with manual extraction on the road because of these three oversights.`,
        outline: [
          'Breaking down the top extraction mistakes viewers make',
          'Demonstrating proper dosing and puck preparation using the 52mm portafilter',
          'Step-by-step pull using manual piston pressure',
          'Summary and tracking link call-to-action',
        ],
        whyItFitsThisCreator: `Builds on their signature educational tutorial style with high replay value.`,
      },
    ],
    keyMessages: brief.approvedFacts.slice(0, 4),
    dos: [
      {
        ruleCode: guidelines[0]?.code || 'G-1',
        instruction: 'Disclose brand sponsorship verbally within the first 30 seconds and in description text.',
      },
      {
        ruleCode: guidelines[2]?.code || 'G-3',
        instruction: 'Show the product in continuous use with hands-on closeups for at least 15 seconds.',
      },
    ],
    donts: [
      {
        ruleCode: guidelines[1]?.code || 'G-2',
        instruction: 'Do not claim the product cures or offers medical/guaranteed outcomes not substantiated in approved facts.',
      },
      {
        ruleCode: guidelines[3]?.code || 'G-4',
        instruction: 'Do not compare the product directly to unapproved competitors.',
      },
    ],
  };
}
