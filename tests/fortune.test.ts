import assert from "node:assert/strict";
import test from "node:test";
import { CLAUSES, RARE_CLAUSE } from "../src/data/clauses";
import {
  formatClauseNumber,
  formatJapaneseDate,
  getFortune,
  getJstDate,
  getRareExample,
  getRecentDates,
} from "../src/lib/fortune";

const DAY_MS = 86_400_000;

test("the original catalog contains 72 complete unique clauses and a separate rare clause", () => {
  assert.equal(CLAUSES.length, 72);
  const allClauses = [...CLAUSES, RARE_CLAUSE];
  assert.equal(new Set(allClauses.map((clause) => clause.id)).size, 73);
  assert.equal(new Set(allClauses.map((clause) => clause.text)).size, 73);
  assert.equal(new Set(allClauses.map(formatClauseNumber)).size, 73);

  for (const clause of allClauses) {
    assert.ok(Number.isInteger(clause.article) && clause.article > 0);
    assert.ok(Number.isInteger(clause.paragraph) && clause.paragraph > 0);
    for (const key of [
      "id",
      "title",
      "text",
      "interpretation",
      "luckyClause",
      "luckyItem",
      "avoid",
    ] as const) {
      assert.equal(typeof clause[key], "string");
      assert.ok(clause[key].trim().length > 0, `${clause.id}: ${key} is empty`);
      assert.doesNotMatch(clause[key], /<\/?(?:script|iframe|img)\b/i);
    }
  }
});

test("the same calendar date always produces the same complete result", () => {
  const result = getFortune("2026-08-27");
  for (let attempt = 0; attempt < 25; attempt += 1) {
    assert.deepEqual(getFortune("2026-08-27"), result);
  }
  assert.equal(result.date, "2026-08-27");
  assert.equal(result.clause.id, "clause-038");
  assert.equal(result.isRare, false);
});

test("mutating a returned clause never changes subsequent draws", () => {
  const original = getFortune("2026-08-27");
  const text = original.clause.text;
  original.clause.text = "This is a caller-local change.";
  assert.equal(getFortune("2026-08-27").clause.text, text);

  const rare = getRareExample("2026-08-27");
  rare.clause.text = "This must not mutate the rare catalog entry.";
  assert.equal(getFortune(rare.date).clause.text, RARE_CLAUSE.text);
});

test("10,000 consecutive dates never repeat a clause on adjacent days", () => {
  const start = new Date("2000-01-01T00:00:00.000Z").getTime();
  const normalIds = new Set<string>();
  const ranks = new Set<string>();
  let previousId: string | undefined;

  for (let index = 0; index < 10_000; index += 1) {
    const date = new Date(start + index * DAY_MS).toISOString().slice(0, 10);
    const result = getFortune(date);
    assert.notEqual(result.clause.id, previousId, `Clause repeated on ${date}`);
    previousId = result.clause.id;
    if (!result.isRare) {
      normalIds.add(result.clause.id);
      ranks.add(result.rank);
    }
  }

  assert.equal(normalIds.size, 72);
  assert.deepEqual(ranks, new Set(["大吉", "吉", "中吉", "小吉", "末吉"]));
});

test("each 97-day window contains exactly one genuine rare draw", () => {
  for (const end of ["2026-08-27", "2024-03-01", "1970-01-01", "0100-03-01"]) {
    const rare = getRecentDates(end, 97).map(getFortune).filter((result) => result.isRare);
    assert.equal(rare.length, 1, end);
    assert.equal(rare[0].rank, "全部読んだことにする大吉");
    assert.equal(rare[0].rankKey, "rare");
    assert.equal(rare[0].clause.id, RARE_CLAUSE.id);
  }
});

test("rare examples always point to a real rare result on another day", () => {
  for (const date of ["2026-08-27", "2024-03-01", "0001-01-01", "9999-12-31"]) {
    const example = getRareExample(date);
    assert.equal(example.isRare, true);
    assert.notEqual(example.date, date);
    assert.deepEqual(example, getFortune(example.date));

    const anotherExample = getRareExample(example.date);
    assert.equal(anotherExample.isRare, true);
    assert.notEqual(anotherExample.date, example.date);
  }
});

test("JST days switch exactly at midnight in Japan", () => {
  assert.equal(getJstDate(new Date("2026-08-26T14:59:59.999Z")), "2026-08-26");
  assert.equal(getJstDate(new Date("2026-08-26T15:00:00.000Z")), "2026-08-27");
  assert.equal(getJstDate(new Date("2026-08-26T23:00:00-07:00")), "2026-08-27");
  assert.equal(getJstDate(new Date("2026-08-27T15:00:00+09:00")), "2026-08-27");
  assert.equal(getJstDate(new Date("2026-12-31T15:00:00.000Z")), "2027-01-01");
  assert.equal(getJstDate(new Date("2024-02-28T15:00:00.000Z")), "2024-02-29");
});

test("JST date extraction rejects invalid Date values and unsupported eras", () => {
  assert.throws(() => getJstDate(new Date(Number.NaN)), RangeError);
  assert.throws(() => getJstDate("2026-08-27" as unknown as Date), RangeError);
  assert.throws(() => getJstDate(new Date("0000-01-01T00:00:00.000Z")), RangeError);
  assert.throws(() => getJstDate(new Date("+010000-01-01T00:00:00.000Z")), RangeError);
});

test("recent dates are newest first and include today and the previous six days", () => {
  assert.deepEqual(getRecentDates("2026-08-27"), [
    "2026-08-27",
    "2026-08-26",
    "2026-08-25",
    "2026-08-24",
    "2026-08-23",
    "2026-08-22",
    "2026-08-21",
  ]);
  assert.deepEqual(getRecentDates("2026-08-27", 0), []);
  assert.deepEqual(getRecentDates("2026-08-27", 1), ["2026-08-27"]);
});

test("date arithmetic crosses leap days and year boundaries without local-time drift", () => {
  assert.deepEqual(getRecentDates("2024-03-02", 4), [
    "2024-03-02", "2024-03-01", "2024-02-29", "2024-02-28",
  ]);
  assert.deepEqual(getRecentDates("2025-03-01", 2), ["2025-03-01", "2025-02-28"]);
  assert.deepEqual(getRecentDates("2000-03-01", 2), ["2000-03-01", "2000-02-29"]);
  assert.deepEqual(getRecentDates("2100-03-01", 2), ["2100-03-01", "2100-02-28"]);
  assert.deepEqual(getRecentDates("2027-01-02", 4), [
    "2027-01-02", "2027-01-01", "2026-12-31", "2026-12-30",
  ]);
  assert.deepEqual(getRecentDates("0100-01-01", 2), ["0100-01-01", "0099-12-31"]);
  assert.deepEqual(getRecentDates("0001-01-01"), ["0001-01-01"]);
});

test("strict date validation rejects silent rollovers and noncanonical inputs", () => {
  const invalidDates = [
    "",
    "2026-2-01",
    "2026-02-1",
    "2026-02-29",
    "2100-02-29",
    "2026-04-31",
    "2026-00-10",
    "2026-13-01",
    "2026-08-00",
    "2026-08-32",
    "0000-01-01",
    "10000-01-01",
    "2026/08/27",
    " 2026-08-27",
    "2026-08-27 ",
    "2026-08-27T00:00:00Z",
    "<script>alert(1)</script>",
  ];

  for (const date of invalidDates) {
    assert.throws(() => getFortune(date), RangeError, date);
    assert.throws(() => getRecentDates(date), RangeError, date);
    assert.throws(() => formatJapaneseDate(date), RangeError, date);
    assert.throws(() => getRareExample(date), RangeError, date);
  }
  assert.throws(() => getFortune(null as unknown as string), RangeError);
});

test("recent-date counts must be bounded nonnegative integers", () => {
  for (const count of [-1, 0.5, Number.NaN, Infinity, 3_661, Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => getRecentDates("2026-08-27", count), RangeError);
  }
});

test("Japanese date labels and article labels are stable", () => {
  assert.equal(formatJapaneseDate("2026-08-27"), "2026年8月27日（木）");
  assert.equal(formatJapaneseDate("2024-02-29"), "2024年2月29日（木）");
  assert.equal(formatJapaneseDate("0001-01-01"), "1年1月1日（月）");
  assert.equal(formatClauseNumber(CLAUSES[11]), "第12条第3項");
  assert.equal(formatClauseNumber(RARE_CLAUSE), "第999条第1項");
});
