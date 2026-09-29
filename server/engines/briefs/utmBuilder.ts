/**
 * UTM Builder for Creator Campaign Briefs
 * Pure function: Builds landing page URL with UTM parameters correctly encoded.
 */

export function slugify(text: string): string {
  if (!text) return 'campaign';
  return text
    .toLowerCase()
    .trim()
    .replace(/^@+/, '') // remove leading @
    .replace(/[^a-z0-9]+/g, '-') // replace non-alphanumeric chars with dashes
    .replace(/^-+|-+$/g, '') // strip leading and trailing dashes
    || 'unnamed';
}

export interface UtmBuilderOptions {
  landingPageUrl: string;
  campaignName: string;
  creatorHandleOrName: string;
}

export function buildCreatorCtaUrl(options: UtmBuilderOptions): string {
  const { landingPageUrl, campaignName, creatorHandleOrName } = options;
  const campaignSlug = slugify(campaignName);
  const creatorSlug = slugify(creatorHandleOrName);

  try {
    const url = new URL(landingPageUrl);
    url.searchParams.set('utm_source', 'youtube');
    url.searchParams.set('utm_medium', 'creator');
    url.searchParams.set('utm_campaign', campaignSlug);
    url.searchParams.set('utm_content', creatorSlug);
    return url.toString();
  } catch {
    // If not a full valid URL, fallback with query params safely
    const separator = landingPageUrl.includes('?') ? '&' : '?';
    const params = new URLSearchParams({
      utm_source: 'youtube',
      utm_medium: 'creator',
      utm_campaign: campaignSlug,
      utm_content: creatorSlug,
    });
    return `${landingPageUrl}${separator}${params.toString()}`;
  }
}
