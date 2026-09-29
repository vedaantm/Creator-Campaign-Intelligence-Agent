import { CONFIG } from '../../../shared/config.ts';
import { DeliverablesTimeline } from '../../../shared/types.ts';

/**
 * Calculates standardized deliverable milestones from launch date and creator planned date.
 * Offsets derived from shared/config.ts.
 */
export function calculateTimeline(
  launchDateStr: string,
  plannedPublishDate?: string | null
): DeliverablesTimeline {
  // Parse launch date safely
  const launchTime = new Date(launchDateStr).getTime();
  const validLaunch = isNaN(launchTime) ? Date.now() + 14 * 86400000 : launchTime;

  const msPerDay = 86400000;
  const draftDueTime = validLaunch - CONFIG.BRIEF_DRAFT_DUE_DAYS_BEFORE_LAUNCH * msPerDay;
  const finalDueTime = validLaunch - CONFIG.BRIEF_FINAL_DUE_DAYS_BEFORE_LAUNCH * msPerDay;

  const draftDueDate = new Date(draftDueTime).toISOString().split('T')[0];
  const finalDueDate = new Date(finalDueTime).toISOString().split('T')[0];
  const defaultPublishDate = new Date(validLaunch).toISOString().split('T')[0];

  const publishDate = plannedPublishDate && !isNaN(new Date(plannedPublishDate).getTime())
    ? new Date(plannedPublishDate).toISOString().split('T')[0]
    : defaultPublishDate;

  return {
    draftDue: draftDueDate,
    feedbackWithinDays: CONFIG.BRIEF_FEEDBACK_WINDOW_DAYS,
    finalDue: finalDueDate,
    publishDate,
  };
}
