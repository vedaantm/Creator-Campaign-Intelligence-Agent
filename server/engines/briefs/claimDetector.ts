import { ClaimWarning } from '../../../shared/types.ts';

const HEALTH_AND_SENSITIVE_WORDS = [
  'cure',
  'cures',
  'curing',
  'heal',
  'heals',
  'healing',
  'treat',
  'treatment',
  'clinically',
  'diagnose',
  'disease',
  'prevent illness',
  'remedy',
  'miracle',
  'guarantee',
  'guaranteed',
  '100%',
  'unlimited',
  'fastest',
  'risk-free',
  'zero risk',
];

/**
 * Validates key messages against approved facts.
 * Flags numbers, prices, or health/performance claims not found in approved facts.
 */
export function detectUnapprovedClaims(
  keyMessages: string[],
  approvedFacts: string[]
): ClaimWarning[] {
  const warnings: ClaimWarning[] = [];
  const normalizedFacts = approvedFacts.map((f) => f.toLowerCase()).join(' ');

  keyMessages.forEach((msg, idx) => {
    const lowerMsg = msg.toLowerCase();

    // 1. Detect currency / prices ($XX, XX dollars, etc.)
    const priceMatches = msg.match(/\$\s*\d+(?:[\.,]\d+)?|\b\d+\s*(?:dollars|usd|bucks)\b/gi) || [];
    for (const price of priceMatches) {
      const cleanPrice = price.toLowerCase().replace(/\s+/g, '');
      const factsClean = normalizedFacts.replace(/\s+/g, '');
      if (!factsClean.includes(cleanPrice)) {
        warnings.push({
          messageIndex: idx,
          claim: price,
          reason: `Price or commercial term "${price}" not found in approved campaign facts.`,
        });
      }
    }

    // 2. Detect numbers / statistics that are not present in approved facts
    const numberMatches = msg.match(/\b\d+(?:[\.,]\d+)?(?:\s*(?:%|bars?|grams?|lbs?|days?|hours?|mins?|minutes?|seconds?|x|times))?(?=\s|[.,;:!?]|$)/gi) || [];
    for (const numStr of numberMatches) {
      const cleanNum = numStr.trim().toLowerCase();
      // Skip common innocent numbers like 1, 2, 3 if plain ordinal
      if (['1', '2', '3'].includes(cleanNum)) continue;
      if (!normalizedFacts.includes(cleanNum)) {
        // Also check raw digits
        const rawDigits = cleanNum.replace(/[^\d]/g, '');
        if (rawDigits.length >= 2 && !normalizedFacts.includes(rawDigits)) {
          warnings.push({
            messageIndex: idx,
            claim: numStr.trim(),
            reason: `Numerical claim or specification "${numStr.trim()}" not substantiated by approved facts.`,
          });
        }
      }
    }

    // 3. Detect sensitive health / performance claims
    for (const term of HEALTH_AND_SENSITIVE_WORDS) {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const termRegex = new RegExp(`(?:^|\\W)${escaped}(?:$|\\W)`, 'i');
      if (termRegex.test(lowerMsg)) {
        if (!termRegex.test(normalizedFacts)) {
          warnings.push({
            messageIndex: idx,
            claim: term,
            reason: `Sensitive performance or health term "${term}" is unapproved and introduces regulatory risk.`,
          });
        }
      }
    }
  });

  // Deduplicate warnings by messageIndex and claim
  const seen = new Set<string>();
  return warnings.filter((w) => {
    const key = `${w.messageIndex}:${w.claim.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
