import { SentimentSummary } from '../../../shared/types.ts';

const POSITIVE_WORDS = [
  'love', 'awesome', 'great', 'amazing', 'best', 'buying', 'bought', 'need this',
  'perfect', 'excellent', 'helpful', 'subbed', 'subscribed', 'good', 'cool', 'super',
  'fantastic', 'fire', 'dope', '10/10', 'worth it', 'clean', 'brilliant', 'solid'
];

const NEGATIVE_WORDS = [
  'hate', 'bad', 'terrible', 'awful', 'overpriced', 'scam', 'waste', 'disappointed',
  'boring', 'sponsored trash', 'sellout', 'worst', 'broken', 'fake', 'fail',
  'don\'t buy', 'dont buy', 'horrible', 'regret', 'useless', 'returned'
];

const QUESTION_PATTERNS = [
  /\?/,
  /\b(how|what|where|when|why|who|which|can i|does it|is it|cost|price)\b/i
];

export function classifyComment(text: string): 'positive' | 'negative' | 'question' | 'neutral' {
  const lower = text.toLowerCase();

  // Check question first
  if (QUESTION_PATTERNS.some((pattern) => pattern.test(lower))) {
    return 'question';
  }

  let posCount = 0;
  let negCount = 0;

  for (const w of POSITIVE_WORDS) {
    if (lower.includes(w)) posCount++;
  }

  for (const w of NEGATIVE_WORDS) {
    if (lower.includes(w)) negCount++;
  }

  if (negCount > posCount) return 'negative';
  if (posCount > negCount) return 'positive';
  return 'neutral';
}

export function classifyCommentsList(comments: string[]): SentimentSummary {
  const summary: SentimentSummary = {
    positive: 0,
    negative: 0,
    neutral: 0,
    question: 0,
    examples: {
      positive: [],
      negative: [],
      neutral: [],
      question: [],
    },
  };

  const sampleLimit = 50;
  const processedComments = comments.slice(0, sampleLimit);

  for (const rawComment of processedComments) {
    const truncated = rawComment.trim().slice(0, 200);
    if (!truncated) continue;

    const category = classifyComment(truncated);
    summary[category]++;

    if (summary.examples[category].length < 3) {
      summary.examples[category].push(truncated);
    }
  }

  return summary;
}
