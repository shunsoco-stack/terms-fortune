import { CLAUSES, RARE_CLAUSE, type FortuneClause } from "../data/clauses";

export type FortuneResult = {
  date: string;
  clause: FortuneClause;
  rank: string;
  rankKey: string;
  isRare: boolean;
};

const DAY_MS = 86_400_000;
const MIN_DAY = Math.floor(new Date("0001-01-01T00:00:00.000Z").getTime() / DAY_MS);
const MAX_DAY = Math.floor(new Date("9999-12-31T00:00:00.000Z").getTime() / DAY_MS);
const RARE_INTERVAL = 97;
const RARE_OFFSET = 41;
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"] as const;
const NORMAL_RANKS = [
  { label: "大吉", key: "daikichi" },
  { label: "吉", key: "kichi" },
  { label: "中吉", key: "chukichi" },
  { label: "小吉", key: "shokichi" },
  { label: "末吉", key: "suekichi" },
] as const;

const jstFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  era: "short",
});

function modulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

/** Strict Gregorian YYYY-MM-DD validation; Date's silent rollover is rejected. */
function toDay(date: string): number {
  if (typeof date !== "string" || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new RangeError("Date must be a valid YYYY-MM-DD between years 0001 and 9999.");
  }

  // Parsing an ISO string avoids Date.UTC's special handling of years 00–99.
  const parsed = new Date(`${date}T00:00:00.000Z`);
  const timestamp = parsed.getTime();
  if (!Number.isFinite(timestamp) || parsed.toISOString().slice(0, 10) !== date) {
    throw new RangeError("Date must be a valid Gregorian calendar date.");
  }

  return Math.floor(timestamp / DAY_MS);
}

function fromDay(day: number): string {
  if (!Number.isInteger(day) || day < MIN_DAY || day > MAX_DAY) {
    throw new RangeError("Date is outside the supported calendar range.");
  }
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

function hashDate(date: string): number {
  let hash = 2_166_136_261;
  for (const character of date) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16_777_619);
  }
  return hash >>> 0;
}

/** The calendar day changes at midnight in Japan, regardless of device timezone. */
export function getJstDate(now: Date = new Date()): string {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new RangeError("An actual, valid Date is required.");
  }

  const parts = jstFormatter.formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value;

  if (part("era") !== "AD") {
    throw new RangeError("Date is outside the supported calendar range.");
  }

  const date = `${part("year")?.padStart(4, "0")}-${part("month")}-${part("day")}`;
  toDay(date);
  return date;
}

/**
 * v1: all visitors get the same result for a given Japanese calendar date.
 * 29 is coprime to the 72-entry dataset: this permutes every ordinary clause
 * without adjacent-day repeats. A separate clause replaces one day in every 97.
 * This is entertainment, not random sampling or a prediction of actual events.
 */
export function getFortune(date: string = getJstDate()): FortuneResult {
  const day = toDay(date);
  if (modulo(day + RARE_OFFSET, RARE_INTERVAL) === 0) {
    return {
      date,
      clause: { ...RARE_CLAUSE },
      rank: "全部読んだことにする大吉",
      rankKey: "rare",
      isRare: true,
    };
  }

  const clause = CLAUSES[modulo(day * 29 + 17, CLAUSES.length)];
  const rank = NORMAL_RANKS[hashDate(date) % NORMAL_RANKS.length];
  return {
    date,
    clause: { ...clause },
    rank: rank.label,
    rankKey: rank.key,
    isRare: false,
  };
}

export function formatJapaneseDate(date: string): string {
  const parsed = new Date(toDay(date) * DAY_MS);
  return `${parsed.getUTCFullYear()}年${parsed.getUTCMonth() + 1}月${parsed.getUTCDate()}日（${WEEKDAYS[parsed.getUTCDay()]}）`;
}

export function formatClauseNumber(clause: FortuneClause): string {
  return `第${clause.article}条第${clause.paragraph}項`;
}

/**
 * Newest first, inclusive of today. Calendar arithmetic always happens in UTC.
 * The count is bounded to ten years to avoid accidental unbounded allocation.
 * At 0001-01-01, the list stops instead of emitting unsupported dates.
 */
export function getRecentDates(today: string, count = 7): string[] {
  const day = toDay(today);
  if (!Number.isSafeInteger(count) || count < 0 || count > 3_660) {
    throw new RangeError("Count must be an integer between 0 and 3660.");
  }

  const length = Math.min(count, day - MIN_DAY + 1);
  return Array.from({ length }, (_, index) => fromDay(day - index));
}

/**
 * A real rare draw from a different date, for a clearly labelled sample screen.
 * Never substitutes a fabricated rare result for today's actual fortune.
 * Normally uses the most recent earlier rare day; near year 0001 uses the next.
 */
export function getRareExample(date: string = getJstDate()): FortuneResult {
  const day = toDay(date);
  const offset = modulo(day + RARE_OFFSET, RARE_INTERVAL);
  const previous = day - (offset || RARE_INTERVAL);
  const example = previous >= MIN_DAY ? previous : day + (RARE_INTERVAL - offset);
  return getFortune(fromDay(example));
}
