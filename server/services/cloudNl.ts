/**
 * Google Cloud Natural Language API Client
 * Optional sentiment analysis if CLOUD_NL_API_KEY is configured.
 */

export interface CloudNlSentimentResult {
  score: number; // -1.0 to 1.0
  magnitude: number;
  isNegative: boolean;
}

export async function analyzeSentimentWithCloudNl(
  text: string
): Promise<CloudNlSentimentResult | null> {
  const apiKey = process.env.CLOUD_NL_API_KEY;
  if (!apiKey || !text.trim()) return null;

  try {
    const url = `https://language.googleapis.com/v1/documents:analyzeSentiment?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        document: {
          type: 'PLAIN_TEXT',
          content: text.slice(0, 1000), // Cloud NL char limit for quick sentiment
        },
        encodingType: 'UTF8',
      }),
    });

    if (!res.ok) {
      return null;
    }

    const data = await res.json();
    const score = data.documentSentiment?.score ?? 0;
    const magnitude = data.documentSentiment?.magnitude ?? 0;

    return {
      score,
      magnitude,
      isNegative: score < -0.25,
    };
  } catch {
    return null;
  }
}
