// A trip's optional name, and the names offered as one-tap suggestions.
// Used by the API to sanitise input and by the forms to suggest names.
//
// Trips used to have up to six tags as well. Tags are no longer written, but
// older trips may still have them: a trip without a name shows its old tags
// as its name, and the next edit of that trip saves them as its name.

export const TRIP_NAME_MAX_LENGTH = 60;

/** How many name suggestions to show under the name field. */
export const TRIP_NAME_SUGGESTIONS = 5;

function collapseSpaces(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

/** Trim and shorten a trip name. Returns '' when there is no usable name. */
export function cleanTripName(value: unknown): string {
  if (typeof value !== 'string') return '';
  return collapseSpaces(value).slice(0, TRIP_NAME_MAX_LENGTH).trim();
}

interface Labelled {
  name?: string;
  tags?: string[];
}

/** The name to show for a trip: its name, or its old tags for trips saved before names replaced them. */
export function tripDisplayName(trip: Labelled): string {
  if (trip.name) return trip.name;
  const tags = (trip.tags ?? []).filter(Boolean);
  return cleanTripName(tags.join(' · '));
}

/**
 * Names used on the given trips, most used first. Ties go to the name used
 * most recently. Names that differ only in case count as one, spelled the way
 * they were most recently typed. Trips are expected newest first, as the API
 * returns them.
 */
export function rankTripNames(trips: Labelled[]): string[] {
  const counts = new Map<string, { name: string; count: number; order: number }>();
  trips.forEach((trip, order) => {
    const name = cleanTripName(trip.name);
    if (!name) return;
    const key = name.toLocaleLowerCase();
    const entry = counts.get(key);
    if (entry) entry.count += 1;
    else counts.set(key, { name, count: 1, order });
  });
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.order - b.order)
    .map((entry) => entry.name);
}

/**
 * The suggestions to show for what has been typed so far. With nothing typed,
 * the most used names. While typing, the names with a word starting with the
 * text, most used first. A name that is already typed in full is left out.
 */
export function suggestTripNames(ranked: string[], typed: string, limit = TRIP_NAME_SUGGESTIONS): string[] {
  const text = collapseSpaces(typed).toLocaleLowerCase();
  if (!text) return ranked.slice(0, limit);
  return ranked
    .filter((name) => {
      const lower = name.toLocaleLowerCase();
      if (lower === text) return false;
      return lower.startsWith(text) || lower.split(' ').some((word) => word.startsWith(text));
    })
    .slice(0, limit);
}

/** Whether two trip names are the same, ignoring case and extra spaces. */
export function sameTripName(a: string, b: string): boolean {
  return cleanTripName(a).toLocaleLowerCase() === cleanTripName(b).toLocaleLowerCase();
}
