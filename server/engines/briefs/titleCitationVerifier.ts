import { CreatorVideo, CitationWarning, ContentAngle } from '../../../shared/types.ts';

export function normalizeTitle(title: string): string {
  if (!title) return '';
  return title
    .toLowerCase()
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts titles quoted or cited in text, e.g. "..." or '...'
 */
export function extractQuotedPhrases(text: string): string[] {
  if (!text) return [];
  const matches = text.match(/["'“‘]([^"'”’]{4,80})["'”’]/g) || [];
  return matches.map((m) => m.slice(1, -1).trim()).filter((s) => s.length >= 4);
}

/**
 * Checks if a given text cites at least one authentic video title from recentVideos.
 */
export function matchesAnyRealVideoTitle(
  citationText: string,
  realVideos: CreatorVideo[]
): { matches: boolean; matchedTitle?: string } {
  const normalizedCitation = normalizeTitle(citationText);
  if (!normalizedCitation) return { matches: false };

  for (const v of realVideos) {
    const normReal = normalizeTitle(v.title);
    if (!normReal) continue;

    // Check exact match, substring match, or high overlap
    if (
      normalizedCitation.includes(normReal) ||
      normReal.includes(normalizedCitation) ||
      (normReal.length > 10 && normalizedCitation.length > 10 && normReal.slice(0, 15) === normalizedCitation.slice(0, 15))
    ) {
      return { matches: true, matchedTitle: v.title };
    }
  }

  return { matches: false };
}

/**
 * Verifies all video citations in creatorSnapshot and contentAngles.
 */
export function verifyBriefCitations(
  creatorSnapshot: string,
  contentAngles: ContentAngle[],
  realVideos: CreatorVideo[]
): CitationWarning[] {
  const warnings: CitationWarning[] = [];

  if (realVideos.length === 0) {
    return warnings;
  }

  // 1. Verify creatorSnapshot
  const snapshotQuotes = extractQuotedPhrases(creatorSnapshot);
  let snapshotHasRealMatch = false;

  for (const quote of snapshotQuotes) {
    if (matchesAnyRealVideoTitle(quote, realVideos).matches) {
      snapshotHasRealMatch = true;
      break;
    }
  }

  // If quotes were found but none matched a real video, or if no quotes were found and text does not match any title
  if (!snapshotHasRealMatch) {
    // Check if the text as a whole contains any real title
    const generalMatch = realVideos.some((v) => {
      const norm = normalizeTitle(v.title);
      return norm.length >= 8 && normalizeTitle(creatorSnapshot).includes(norm);
    });

    if (!generalMatch && snapshotQuotes.length > 0) {
      warnings.push({
        field: 'creatorSnapshot',
        citedTitle: snapshotQuotes.join(', '),
        reason: `Cited title in creator snapshot does not match any recent video from this creator.`,
      });
    }
  }

  // 2. Verify each content angle's whyItFitsThisCreator
  contentAngles.forEach((angle, idx) => {
    const angleQuotes = extractQuotedPhrases(angle.whyItFitsThisCreator);
    let matched = false;

    for (const q of angleQuotes) {
      if (matchesAnyRealVideoTitle(q, realVideos).matches) {
        matched = true;
        break;
      }
    }

    if (!matched) {
      const generalMatch = realVideos.some((v) => {
        const norm = normalizeTitle(v.title);
        return norm.length >= 8 && normalizeTitle(angle.whyItFitsThisCreator).includes(norm);
      });

      if (!generalMatch && angleQuotes.length > 0) {
        warnings.push({
          field: `contentAngles.${idx}.whyItFitsThisCreator`,
          citedTitle: angleQuotes.join(', '),
          reason: `Cited video in angle #${idx + 1} does not match any real video on this channel.`,
        });
      }
    }
  });

  return warnings;
}
