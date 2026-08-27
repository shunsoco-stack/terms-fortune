import assert from "node:assert/strict";
import test from "node:test";
import { CLAUSES, RARE_CLAUSE } from "../src/data/clauses";
import { getRareExample, type FortuneResult } from "../src/lib/fortune";
import { createShareCard, getShareText } from "../src/lib/share-card";

const DATE = "2026-08-27";
const NORMAL_RANKS = ["大吉", "吉", "中吉", "小吉", "末吉"] as const;
const RARE = getRareExample(DATE);
const DISCLAIMER = "法的効力はありません。法律相談ではありません。";
const SAMPLE_MARKER = "大吉の見本 / 今日の結果ではありません";
const RESULTS: FortuneResult[] = CLAUSES.map((clause) => ({
  date: DATE,
  clause,
  rank: "吉",
  rankKey: "kichi",
  isRare: false,
}));

function resultUrl(result: FortuneResult): string {
  return `https://terms-fortune.test/?date=${result.date}#result`;
}

function conservativeXWeight(text: string): number {
  // This is an intentionally conservative bound, not an implementation of X's
  // full Unicode rules: ASCII weighs 1, other graphemes/code points weigh 2,
  // and every complete URL occupies its shortened-link allowance of 23.
  let total = 0;
  const withoutUrls = text.replace(/https?:\/\/\S+/gu, () => {
    total += 23;
    return "";
  });
  for (const character of withoutUrls) {
    total += character.codePointAt(0)! <= 0x7f ? 1 : 2;
  }
  return total;
}

test("all 72 original clauses and the genuine rare result preserve their date, rank, and complete clause", () => {
  assert.equal(RESULTS.length, 72);
  assert.equal(RARE.clause.id, RARE_CLAUSE.id);
  assert.equal(RARE.isRare, true);

  // Exact equality limits the shared copy to our authored catalog and fixed
  // labels; this is not a claim that an automated test proves copyright origin.
  for (const result of [...RESULTS, RARE]) {
    const url = resultUrl(result);
    const text = getShareText(result, url);
    assert.equal(text, [
      `【${result.date}の利用規約占い】`,
      `運勢：${result.rank}`,
      `第${result.clause.article}条第${result.clause.paragraph}項：${result.clause.text}`,
      "#利用規約占い",
      DISCLAIMER,
      url,
    ].join("\n"), result.clause.id);
    assert.ok(text.includes("法的効力はありません。"), result.clause.id);
    assert.ok(text.includes("法律相談ではありません。"), result.clause.id);
    assert.ok(!text.includes(SAMPLE_MARKER), result.clause.id);
  }
});

test("a rare sample is unmistakably marked as a sample instead of today's real result", () => {
  const url = "https://terms-fortune.test/#sample";
  const text = getShareText(RARE, url, { sample: true });

  assert.equal(text.split("\n")[0], `【${SAMPLE_MARKER}】`);
  assert.ok(text.includes("運勢：全部読んだことにする大吉"));
  assert.ok(text.includes(RARE_CLAUSE.text));
  assert.ok(text.includes(DISCLAIMER));
  assert.ok(!text.includes(`【${RARE.date}の利用規約占い】`));
  assert.equal(text.split("\n").at(-1), url);
});

test("every original clause fits the conservative X text limit with each ordinary rank", () => {
  for (const result of RESULTS) {
    for (const rank of NORMAL_RANKS) {
      const text = getShareText({ ...result, rank }, resultUrl(result));
      assert.ok(
        conservativeXWeight(text) <= 280,
        `${result.clause.id} / ${rank}: ${conservativeXWeight(text)} weighted characters`,
      );
    }
  }
});

test("both genuine and sample rare shares fit the conservative X limit without dropping disclaimers", () => {
  for (const sample of [false, true]) {
    const url = sample ? "https://terms-fortune.test/#sample" : resultUrl(RARE);
    const text = getShareText(RARE, url, { sample });

    assert.ok(conservativeXWeight(text) <= 280, `sample=${sample}: ${conservativeXWeight(text)}`);
    assert.ok(text.includes(RARE_CLAUSE.text));
    assert.ok(text.includes(DISCLAIMER));
  }
});

test("the supplied URL is preserved exactly once, including its query and fragment", () => {
  const urls = [
    "https://terms-fortune.test/?date=2026-08-27#result",
    "https://terms-fortune.test/?date=2026-08-27&source=share%20card#result",
    "https://terms-fortune.test/#sample",
  ];

  for (const url of urls) {
    const text = getShareText(RESULTS[0], url);
    assert.equal(text.split("\n").at(-1), url);
    assert.equal(text.split(url).length - 1, 1);
    assert.deepEqual(text.match(/https?:\/\/\S+/gu), [url]);
  }
});

test("share text is deterministic and never mutates the supplied result", () => {
  const result = Object.freeze({
    ...RESULTS[0],
    clause: Object.freeze({ ...RESULTS[0].clause }),
  });
  const before = structuredClone(result);
  const first = getShareText(result, resultUrl(result));

  for (let attempt = 0; attempt < 5; attempt += 1) {
    assert.equal(getShareText(result, resultUrl(result)), first);
  }
  assert.deepEqual(result, before);
});

test("formatting all share text performs no runtime network requests", (context) => {
  const network = context.mock.method(globalThis, "fetch", () => {
    throw new Error("Sharing text must never fetch an external service or real terms");
  });

  for (const result of [...RESULTS, RARE]) {
    getShareText(result, resultUrl(result));
  }
  getShareText(RARE, "https://terms-fortune.test/#sample", { sample: true });
  assert.equal(network.mock.callCount(), 0);
});

test("image creation fails clearly outside a browser without attempting network access", async (context) => {
  const network = context.mock.method(globalThis, "fetch", () => {
    throw new Error("No network fallback is allowed for card creation");
  });

  assert.equal(typeof document, "undefined");
  await assert.rejects(createShareCard(RESULTS[0]), /画像の作成はブラウザーでご利用ください/u);
  assert.equal(network.mock.callCount(), 0);
});
