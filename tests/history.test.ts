import assert from "node:assert/strict";
import test from "node:test";
import {
  clearHistory,
  HISTORY_STORAGE_KEY,
  readHistory,
  recordHistory,
} from "../src/lib/history";

const TODAY = "2026-08-27";

function memoryStorage(initial: string | null = null) {
  const values = new Map<string, string>();
  if (initial !== null) values.set(HISTORY_STORAGE_KEY, initial);
  const calls = { reads: 0, writes: 0, removals: 0 };

  const storage = {
    getItem(key: string): string | null {
      calls.reads += 1;
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string): void {
      calls.writes += 1;
      values.set(key, value);
    },
    removeItem(key: string): void {
      calls.removals += 1;
      values.delete(key);
    },
  };

  return { storage, values, calls };
}

test("new storage has no history and reading never writes", () => {
  const memory = memoryStorage();
  assert.deepEqual(readHistory(TODAY, memory.storage), []);
  assert.equal(memory.calls.writes, 0);
  assert.equal(memory.calls.removals, 0);
});

test("stored dates are deduplicated, sorted, and limited to seven calendar days", () => {
  const memory = memoryStorage(JSON.stringify([
    "2026-08-21", "2026-08-27", "2026-08-24", "2026-08-27", "2026-08-22",
    "2026-08-20", "2026-08-28", "2025-08-27", "9999-12-31",
  ]));
  assert.deepEqual(readHistory(TODAY, memory.storage), [
    "2026-08-27", "2026-08-24", "2026-08-22", "2026-08-21",
  ]);
});

test("history retention crosses leap days and New Year correctly", () => {
  const leap = memoryStorage(JSON.stringify([
    "2024-03-01", "2024-02-29", "2024-02-24", "2024-02-23", "2024-03-02",
  ]));
  assert.deepEqual(readHistory("2024-03-01", leap.storage), [
    "2024-03-01", "2024-02-29", "2024-02-24",
  ]);

  const year = memoryStorage(JSON.stringify([
    "2027-01-02", "2027-01-01", "2026-12-31", "2026-12-27", "2026-12-26",
  ]));
  assert.deepEqual(readHistory("2027-01-02", year.storage), [
    "2027-01-02", "2027-01-01", "2026-12-31", "2026-12-27",
  ]);
});

test("malformed JSON and unexpected top-level shapes are harmless", () => {
  for (const raw of [
    "", "{", "not-json", "null", "true", "27", '"2026-08-27"',
    '{"dates":["2026-08-27"]}', '{"__proto__":{"polluted":true}}',
  ]) {
    const memory = memoryStorage(raw);
    assert.deepEqual(readHistory(TODAY, memory.storage), [], raw);
  }
});

test("HTML, objects, injected ranks, and noncanonical dates never become history", () => {
  const memory = memoryStorage(JSON.stringify([
    "2026-08-27",
    "<script>alert(1)</script>",
    { date: "2026-08-26", rank: "全部読んだことにする大吉" },
    { __proto__: { polluted: true } },
    ["2026-08-25"],
    null,
    true,
    20260824,
    "2026-8-23",
    "2026-08-22T00:00:00Z",
    "2026-08-21 ",
    "2026-02-30",
  ]));
  assert.deepEqual(readHistory(TODAY, memory.storage), ["2026-08-27"]);
  assert.equal(Object.hasOwn(Object.prototype, "polluted"), false);
});

test("unreasonably large saved values are ignored before parsing", () => {
  const memory = memoryStorage(JSON.stringify(Array(1_000).fill(TODAY)));
  assert.deepEqual(readHistory(TODAY, memory.storage), []);
});

test("recording a draw writes only canonical date strings and preserves other app keys", () => {
  const memory = memoryStorage(JSON.stringify(["2026-08-26", "2026-08-20"]));
  memory.values.set("another-app:settings", "untouched");

  const saved = recordHistory(TODAY, TODAY, memory.storage);
  assert.deepEqual(saved, { dates: ["2026-08-27", "2026-08-26"], persisted: true });
  assert.equal(memory.values.get(HISTORY_STORAGE_KEY), '["2026-08-27","2026-08-26"]');
  assert.equal(memory.values.get("another-app:settings"), "untouched");
  assert.equal(memory.calls.writes, 1);

  assert.deepEqual(recordHistory(TODAY, TODAY, memory.storage), saved);
  assert.deepEqual(readHistory(TODAY, memory.storage), ["2026-08-27", "2026-08-26"]);
});

test("recording across midnight drops yesterday's oldest retained day", () => {
  const memory = memoryStorage(JSON.stringify([
    "2026-08-27", "2026-08-26", "2026-08-25", "2026-08-24",
    "2026-08-23", "2026-08-22", "2026-08-21",
  ]));
  const result = recordHistory("2026-08-28", "2026-08-28", memory.storage);
  assert.deepEqual(result, {
    dates: [
      "2026-08-28", "2026-08-27", "2026-08-26", "2026-08-25",
      "2026-08-24", "2026-08-23", "2026-08-22",
    ],
    persisted: true,
  });
  assert.equal(JSON.parse(memory.values.get(HISTORY_STORAGE_KEY) ?? "[]").length, 7);
});

test("invalid, old, and future dates cannot be injected by recording", () => {
  const memory = memoryStorage(JSON.stringify([TODAY]));
  for (const date of ["2026-08-20", "2026-08-28", "2026-02-30", "bad", "2026-8-27"]) {
    assert.deepEqual(recordHistory(date, TODAY, memory.storage), {
      dates: [TODAY],
      persisted: false,
    });
  }
  assert.equal(memory.calls.writes, 0);
});

test("invalid today values fail closed without accessing or changing storage", () => {
  const memory = memoryStorage(JSON.stringify([TODAY]));
  assert.deepEqual(readHistory("2026-02-30", memory.storage), []);
  assert.deepEqual(recordHistory(TODAY, "not-a-date", memory.storage), {
    dates: [], persisted: false,
  });
  assert.equal(memory.calls.reads, 0);
  assert.equal(memory.calls.writes, 0);
});

test("corrupted storage is replaced with a valid date-only record on the next draw", () => {
  const memory = memoryStorage("not valid JSON");
  assert.deepEqual(recordHistory(TODAY, TODAY, memory.storage), {
    dates: [TODAY], persisted: true,
  });
  assert.equal(memory.values.get(HISTORY_STORAGE_KEY), '["2026-08-27"]');
});

test("read and write failures are nonfatal and an unsaved draw stays available in memory", () => {
  const denied = {
    getItem(): never { throw new Error("Storage access denied"); },
    setItem(): never { throw new Error("Storage access denied"); },
    removeItem(): never { throw new Error("Storage access denied"); },
  };
  assert.deepEqual(readHistory(TODAY, denied), []);
  assert.deepEqual(recordHistory(TODAY, TODAY, denied), {
    dates: [TODAY], persisted: false,
  });
  assert.equal(clearHistory(denied), false);

  const quotaExceeded = {
    getItem: () => '["2026-08-26"]',
    setItem(): never { throw new Error("Quota exceeded"); },
  };
  assert.deepEqual(recordHistory(TODAY, TODAY, quotaExceeded), {
    dates: ["2026-08-27", "2026-08-26"], persisted: false,
  });
});

test("clearing history removes only its own storage key", () => {
  const memory = memoryStorage(JSON.stringify([TODAY]));
  memory.values.set("terms-fortune:theme", "dark");
  memory.values.set("another-app:settings", "untouched");
  assert.equal(clearHistory(memory.storage), true);
  assert.equal(memory.values.has(HISTORY_STORAGE_KEY), false);
  assert.equal(memory.values.get("terms-fortune:theme"), "dark");
  assert.equal(memory.values.get("another-app:settings"), "untouched");
  assert.equal(memory.calls.removals, 1);
  assert.equal(clearHistory(memory.storage), true);
});

test("server-side use without window remains safe", () => {
  assert.equal(typeof window, "undefined");
  assert.deepEqual(readHistory(TODAY), []);
  assert.deepEqual(recordHistory(TODAY, TODAY), { dates: [TODAY], persisted: false });
  assert.equal(clearHistory(), false);
});

test("a throwing localStorage property getter is handled without a crash", () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const restrictedWindow = Object.defineProperty({}, "localStorage", {
    get(): never { throw new Error("SecurityError"); },
  });
  Object.defineProperty(globalThis, "window", { configurable: true, value: restrictedWindow });

  try {
    assert.deepEqual(readHistory(TODAY), []);
    assert.deepEqual(recordHistory(TODAY, TODAY), { dates: [TODAY], persisted: false });
    assert.equal(clearHistory(), false);
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
