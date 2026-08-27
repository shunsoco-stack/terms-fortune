import { getRecentDates } from "./fortune";

export const HISTORY_STORAGE_KEY = "terms-fortune:history:v1";
const MAX_STORED_LENGTH = 8_192;

type HistoryReader = Pick<Storage, "getItem">;
type HistoryWriter = Pick<Storage, "getItem" | "setItem">;
type HistoryRemover = Pick<Storage, "removeItem">;

function browserStorage(): Storage | undefined {
  // Accessing the property itself can throw in private or restricted contexts.
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

function allowedDates(today: string): Set<string> | undefined {
  try {
    return new Set(getRecentDates(today, 7));
  } catch {
    return undefined;
  }
}

function descendingUnique(dates: string[]): string[] {
  return [...new Set(dates)].sort().reverse();
}

function readDates(allowed: Set<string>, storage?: HistoryReader): string[] {
  if (!storage) return [];

  try {
    const raw = storage.getItem(HISTORY_STORAGE_KEY);
    if (typeof raw !== "string" || raw.length > MAX_STORED_LENGTH) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    // Accept exact dates only. Never trust saved objects, ranks, or HTML strings.
    return descendingUnique(
      parsed.filter(
        (value): value is string => typeof value === "string" && allowed.has(value),
      ),
    );
  } catch {
    // Invalid JSON, unavailable localStorage, or a corrupted adapter is harmless.
    return [];
  }
}

/** Only viewed dates in today's seven-calendar-day window are returned. */
export function readHistory(today: string, storage?: HistoryReader): string[] {
  const allowed = allowedDates(today);
  if (!allowed) return [];
  return readDates(allowed, storage ?? browserStorage());
}

/**
 * Persists dates only, not result text or personal data. An unsuccessful write
 * still returns the new in-memory list so the current screen remains usable.
 * Saving also removes expired entries; simply reading does not mutate storage.
 */
export function recordHistory(
  date: string,
  today: string,
  storage?: HistoryWriter,
): { dates: string[]; persisted: boolean } {
  const allowed = allowedDates(today);
  if (!allowed) return { dates: [], persisted: false };

  const target = storage ?? browserStorage();
  const previous = readDates(allowed, target);
  if (typeof date !== "string" || !allowed.has(date)) {
    return { dates: previous, persisted: false };
  }

  const dates = descendingUnique([...previous, date]);
  if (!target) return { dates, persisted: false };

  try {
    target.setItem(HISTORY_STORAGE_KEY, JSON.stringify(dates));
    return { dates, persisted: true };
  } catch {
    return { dates, persisted: false };
  }
}

/** Removes this app's history key only; never calls localStorage.clear(). */
export function clearHistory(storage?: HistoryRemover): boolean {
  const target = storage ?? browserStorage();
  if (!target) return false;

  try {
    target.removeItem(HISTORY_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
