import React from 'react';
import { Helmet } from 'react-helmet-async';

export interface SEOProps {
  title?: string;
  description?: string;
  canonicalUrl?: string;
  type?: string;
  schemaJson?: Record<string, unknown>;
}

export function SEO({
  title = 'Creator Campaign Intelligence Agent',
  description = 'AI-powered creator discovery, pre-mortem risk simulation, compliance auditing, search capture, and live pulse monitoring for YouTube influencer campaigns.',
  canonicalUrl,
  type = 'website',
  schemaJson,
}: SEOProps) {
  const siteName = 'CCIA — Creator Campaign Intelligence Agent';
  const fullTitle = title.includes('CCIA') || title.includes('Creator Campaign')
    ? title
    : `${title} | CCIA`;
  const url = canonicalUrl || (typeof window !== 'undefined' ? window.location.href : '');

  // Default WebApplication structured data
  const defaultSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    'name': 'Creator Campaign Intelligence Agent',
    'applicationCategory': 'BusinessApplication',
    'operatingSystem': 'All',
    'description': description,
  };

  const schemaToEmbed = schemaJson || defaultSchema;

  return (
    <Helmet>
      {/* Standard Metadata */}
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      {url && <link rel="canonical" href={url} />}

      {/* OpenGraph / Facebook */}
      <meta property="og:type" content={type} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:site_name" content={siteName} />
      {url && <meta property="og:url" content={url} />}

      {/* Twitter / X */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />

      {/* Structured Data (JSON-LD) */}
      <script type="application/ld+json">{JSON.stringify(schemaToEmbed)}</script>
    </Helmet>
  );
}
