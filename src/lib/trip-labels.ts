// Optional labels a user can put on a trip: a short name and a few tags.
// Used by the API to sanitise input and by the forms to give instant feedback.

export const TRIP_NAME_MAX_LENGTH = 60;
export const TRIP_TAG_MAX_LENGTH = 24;
export const TRIP_TAGS_MAX = 6;

function collapseSpaces(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

/** Trim and shorten a trip name. Returns '' when there is no usable name. */
export function cleanTripName(value: unknown): string {
  if (typeof value !== 'string') return '';
  return collapseSpaces(value).slice(0, TRIP_NAME_MAX_LENGTH).trim();
}

/** Normalise one tag: no leading '#', single spaces, limited length. */
export function cleanTripTag(value: unknown): string {
  if (typeof value !== 'string') return '';
  return collapseSpaces(collapseSpaces(value).replace(/^#+/, '')).slice(0, TRIP_TAG_MAX_LENGTH).trim();
}

/**
 * Turn user input (an array, or a comma-separated string) into a clean tag
 * list: duplicates removed case-insensitively, first spelling kept, at most
 * TRIP_TAGS_MAX tags.
 */
export function cleanTripTags(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  const tags: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const tag = cleanTripTag(item);
    const key = tag.toLocaleLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
    if (tags.length >= TRIP_TAGS_MAX) break;
  }
  return tags;
}

/** Every tag used across the given trips, most used first. */
export function collectTripTags(trips: { tags?: string[] }[]): string[] {
  const counts = new Map<string, { tag: string; count: number }>();
  for (const trip of trips) {
    for (const tag of trip.tags ?? []) {
      const key = tag.toLocaleLowerCase();
      const entry = counts.get(key);
      if (entry) entry.count += 1;
      else counts.set(key, { tag, count: 1 });
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .map((entry) => entry.tag);
}

export function tripHasTag(trip: { tags?: string[] }, tag: string): boolean {
  const key = tag.toLocaleLowerCase();
  return (trip.tags ?? []).some((item) => item.toLocaleLowerCase() === key);
}
