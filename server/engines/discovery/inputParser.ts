import { CreatorInputType } from '../../../shared/types.ts';

export interface ParsedCreatorInput {
  valid: boolean;
  inputType?: CreatorInputType;
  normalizedKey?: string;
  queryValue?: string; // value used to query YouTube API (e.g. raw handle without @, or channelId)
  error?: string;
}

/**
 * Pure function to parse, validate, and normalize creator inputs.
 * Accepts:
 *  - Channel IDs (starts with "UC", 24 characters)
 *  - @handles (e.g. "@mkbhd")
 *  - URLs (youtube.com/@handle, youtube.com/channel/UC..., youtube.com/c/name, youtube.com/user/name)
 *    with or without https, www, m., trailing slashes, path suffixes like /videos, or query params.
 */
export function parseCreatorInput(rawInput: string): ParsedCreatorInput {
  if (!rawInput || typeof rawInput !== 'string') {
    return { valid: false, error: 'Input cannot be empty' };
  }

  const trimmed = rawInput.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'Input cannot be empty' };
  }

  // 1. Direct Channel ID: starts with UC and exactly 24 alphanumeric / - / _ characters
  if (/^UC[a-zA-Z0-9_-]{22}$/.test(trimmed)) {
    return {
      valid: true,
      inputType: 'channelId',
      normalizedKey: trimmed,
      queryValue: trimmed,
    };
  }

  // 2. Direct Handle: starts with '@' followed by valid YouTube handle chars (letters, numbers, underscores, periods, dashes, min 3 chars)
  if (/^@[a-zA-Z0-9._-]{3,30}$/.test(trimmed)) {
    const handleWithoutAt = trimmed.slice(1);
    return {
      valid: true,
      inputType: 'handle',
      normalizedKey: `@${handleWithoutAt.toLowerCase()}`,
      queryValue: handleWithoutAt,
    };
  }

  // 3. URLs
  // Clean URL: strip leading protocol if any, or normalize
  let urlStr = trimmed;
  if (!urlStr.startsWith('http://') && !urlStr.startsWith('https://')) {
    // If it looks like a youtube domain or path
    if (urlStr.includes('youtube.com/') || urlStr.includes('youtu.be/')) {
      urlStr = `https://${urlStr}`;
    }
  }

  try {
    const parsedUrl = new URL(urlStr);
    const host = parsedUrl.hostname.toLowerCase().replace(/^(www\.|m\.)/, '');

    if (host === 'youtube.com') {
      const pathname = parsedUrl.pathname;
      const segments = pathname.split('/').filter(Boolean);

      if (segments.length === 0) {
        return { valid: false, error: 'YouTube URL does not point to a channel or creator' };
      }

      const firstSeg = segments[0];

      // Format: /@handle or /@handle/videos
      if (firstSeg.startsWith('@')) {
        const handle = firstSeg.slice(1);
        if (/^[a-zA-Z0-9._-]{3,30}$/.test(handle)) {
          return {
            valid: true,
            inputType: 'url',
            normalizedKey: `@${handle.toLowerCase()}`,
            queryValue: handle,
          };
        }
        return { valid: false, error: 'Invalid handle in YouTube URL' };
      }

      // Format: /channel/UC...
      if (firstSeg === 'channel' && segments[1]) {
        const channelId = segments[1];
        if (/^UC[a-zA-Z0-9_-]{22}$/.test(channelId)) {
          return {
            valid: true,
            inputType: 'url',
            normalizedKey: channelId,
            queryValue: channelId,
          };
        }
        return { valid: false, error: 'Invalid channel ID in YouTube URL' };
      }

      // Format: /c/CustomName
      if (firstSeg === 'c' && segments[1]) {
        const customName = segments[1];
        return {
          valid: true,
          inputType: 'url',
          normalizedKey: `c:${customName.toLowerCase()}`,
          queryValue: customName,
        };
      }

      // Format: /user/UserName
      if (firstSeg === 'user' && segments[1]) {
        const username = segments[1];
        return {
          valid: true,
          inputType: 'url',
          normalizedKey: `user:${username.toLowerCase()}`,
          queryValue: username,
        };
      }

      // Single-segment custom URL or handle without @, e.g. /caseyneistat or /mkbhd
      if (segments.length === 1 && !firstSeg.startsWith('@') && firstSeg !== 'watch' && firstSeg !== 'feed' && firstSeg !== 'shorts') {
        return {
          valid: true,
          inputType: 'url',
          normalizedKey: `c:${firstSeg.toLowerCase()}`,
          queryValue: firstSeg,
        };
      }

      return {
        valid: false,
        error: `Unsupported YouTube path format: ${pathname}`,
      };
    }
  } catch {
    // If not a valid URL
  }

  // Check if user typed a bare handle without '@' (3-30 valid handle characters)
  if (/^[a-zA-Z0-9._-]{3,30}$/.test(trimmed)) {
    return {
      valid: true,
      inputType: 'handle',
      normalizedKey: `@${trimmed.toLowerCase()}`,
      queryValue: trimmed,
    };
  }

  return {
    valid: false,
    error: 'Unrecognized creator input format. Enter a YouTube @handle, channel ID (UC...), or channel URL.',
  };
}
