import { CreatorBriefContent } from '../../../shared/types.ts';

/**
 * Retrieves a nested value from an object via dot-path (e.g. "contentAngles.0.hook").
 */
export function getNestedProperty(obj: any, path: string): any {
  if (!obj || !path) return undefined;
  const parts = path.split('.');
  let curr = obj;
  for (const part of parts) {
    if (curr === null || curr === undefined) return undefined;
    curr = curr[part];
  }
  return curr;
}

/**
 * Sets a nested value on an object via dot-path, mutating or constructing objects/arrays as needed.
 */
export function setNestedProperty(obj: any, path: string, value: any): void {
  if (!obj || !path) return;
  const parts = path.split('.');
  let curr = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    const nextKey = parts[i + 1];
    if (curr[key] === undefined || curr[key] === null) {
      // If next key is numeric index, initialize array, else object
      curr[key] = /^\d+$/.test(nextKey) ? [] : {};
    }
    curr = curr[key];
  }
  curr[parts[parts.length - 1]] = value;
}

/**
 * Merges newly generated content with previous content, strictly preserving
 * all field paths tracked in editedFields.
 */
export function mergePreservingEdits<T>(
  newContent: T,
  previousContent: any,
  editedFields: string[]
): T {
  const merged = JSON.parse(JSON.stringify(newContent)) as T;

  for (const fieldPath of editedFields) {
    const existingVal = getNestedProperty(previousContent, fieldPath);
    if (existingVal !== undefined) {
      setNestedProperty(merged, fieldPath, JSON.parse(JSON.stringify(existingVal)));
    }
  }

  return merged;
}

/**
 * Recursively inspects two content objects and returns an array of dot paths
 * where values differ.
 */
export function detectChangedFieldPaths(
  base: any,
  updated: any,
  prefix = ''
): string[] {
  const changed: string[] = [];

  // If one is undefined and the other not
  if (base === undefined && updated !== undefined) {
    if (prefix) changed.push(prefix);
    return changed;
  }
  if (base !== undefined && updated === undefined) {
    if (prefix) changed.push(prefix);
    return changed;
  }

  // Primitive comparisons or null
  if (
    typeof base !== 'object' ||
    base === null ||
    typeof updated !== 'object' ||
    updated === null
  ) {
    if (base !== updated) {
      if (prefix) changed.push(prefix);
    }
    return changed;
  }

  // Arrays
  if (Array.isArray(base) || Array.isArray(updated)) {
    if (!Array.isArray(base) || !Array.isArray(updated) || base.length !== updated.length) {
      if (prefix) changed.push(prefix);
      return changed;
    }
    // Check elements
    for (let i = 0; i < Math.max(base.length, updated.length); i++) {
      const p = prefix ? `${prefix}.${i}` : `${i}`;
      const elemChanges = detectChangedFieldPaths(base[i], updated[i], p);
      changed.push(...elemChanges);
    }
    return changed;
  }

  // Objects: compare all keys from both
  const allKeys = Array.from(new Set([...Object.keys(base), ...Object.keys(updated)]));
  for (const key of allKeys) {
    // Skip automated metadata or code-derived objects that shouldn't mark content as user-edited
    if (['claimWarnings', 'citationWarnings'].includes(key) && !prefix) continue;

    const p = prefix ? `${prefix}.${key}` : key;
    const subChanges = detectChangedFieldPaths(base[key], updated[key], p);
    changed.push(...subChanges);
  }

  return changed;
}
