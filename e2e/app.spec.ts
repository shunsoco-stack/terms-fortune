import { Buffer } from "node:buffer";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { formatJapaneseDate, getFortune, getRareExample, getRecentDates } from "../src/lib/fortune";
import { HISTORY_STORAGE_KEY } from "../src/lib/history";
import { SITE_URL } from "../src/lib/site";

const TODAY = "2026-08-27";
const THEME_KEY = "terms-fortune:theme:v1";
const DRAW_LABEL = "今日の利用規約を確認する";
const DIALOG_LABEL = "運勢を、おすそわけ。";
const NATIVE_ERROR = "端末の共有メニューを利用できませんでした。コピーか画像保存をお試しください。";

const isAnalyticsUrl = (url: URL) => url.pathname.includes("/insights/")
  || url.hostname === "va.vercel-scripts.com"
  || url.hostname.endsWith("vercel-insights.com");

// Test traffic must not become production analytics, including when E2E_BASE_URL
// points at a deployment. The SDK stays loaded; its remote collector does not.
test.beforeEach(async ({ context }) => {
  await context.route(isAnalyticsUrl, async (route) => {
    const script = route.request().resourceType() === "script";
    await route.fulfill({
      status: script ? 200 : 204,
      contentType: script ? "application/javascript" : "text/plain",
      body: script ? "/* Analytics collection is disabled in E2E tests. */" : "",
    });
  });
});

async function freezeDate(page: Page, date = TODAY) {
  // Only Date is fixed: hydration, animation frames, and UI timers still run.
  await page.clock.setFixedTime(new Date(`${date}T03:00:00.000Z`));
}

async function visitHome(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("button", { name: DRAW_LABEL, exact: true })).toBeEnabled();
}

async function drawToday(page: Page) {
  await page.getByRole("button", { name: DRAW_LABEL, exact: true }).click();
  await expect(page.getByTestId("fortune-clause")).toBeVisible();
}

async function openShare(page: Page) {
  await page.getByRole("button", { name: "結果を共有する", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: DIALOG_LABEL, exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function openHistory(page: Page) {
  await page.getByRole("navigation", { name: "メインメニュー" })
    .getByRole("link", { name: "これまでの条文", exact: true }).click();
  await expect(page.getByRole("heading", { name: "これまでの条文", level: 1 })).toBeVisible();
}

function historyList(page: Page) {
  return page.locator('[aria-label="直近7日間の占い履歴"]');
}

function historyDay(page: Page, date: string, viewed: boolean) {
  const state = viewed ? getFortune(date).rank : "未確認の条文を開く";
  return historyList(page).getByRole("button", {
    name: `${formatJapaneseDate(date)} ${state}`,
    exact: true,
  });
}

async function expectViewedCount(page: Page, count: number) {
  await expect(page.getByRole("main").getByText(new RegExp(`この端末で\\s*${count}\\s*日分を確認済み`)))
    .toBeVisible();
}

async function seedStorage(page: Page, entries: Record<string, string>) {
  await page.addInitScript((items) => {
    for (const [key, value] of Object.entries(items)) localStorage.setItem(key, value);
  }, entries);
}

async function storedHistory(page: Page) {
  return page.evaluate((key) => localStorage.getItem(key), HISTORY_STORAGE_KEY);
}

async function expectHistory(page: Page, dates: string[]) {
  await expect.poll(() => storedHistory(page)).toBe(JSON.stringify(dates));
}

async function storageSnapshot(page: Page) {
  return page.evaluate(() => Object.fromEntries(Object.entries(localStorage).sort()));
}

type ShareProbe = {
  native: Array<{
    title?: string;
    text?: string;
    url?: string;
    files: Array<{ name: string; type: string; size: number }>;
  }>;
  clipboard: string[];
  canShareCalls: number;
};

type ShareMockOptions = {
  native: "success" | "abort" | "error" | "missing";
  clipboard?: "success" | "error" | "missing";
  files?: boolean;
  canShareThrows?: boolean;
};

/** Browser APIs are mocked only in these error-path tests, never in app code. */
async function mockShareCapabilities(page: Page, options: ShareMockOptions) {
  await page.addInitScript((settings) => {
    const probe: ShareProbe = { native: [], clipboard: [], canShareCalls: 0 };
    Object.defineProperty(window, "__termsFortuneShareProbe", { configurable: true, value: probe });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: settings.clipboard === "missing" ? undefined : {
        async writeText(text: string) {
          probe.clipboard.push(text);
          if (settings.clipboard === "error") throw new DOMException("Clipboard denied", "NotAllowedError");
        },
      },
    });
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      value: () => {
        probe.canShareCalls += 1;
        if (settings.canShareThrows) throw new DOMException("File sharing is unavailable", "NotSupportedError");
        return Boolean(settings.files);
      },
    });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: settings.native === "missing" ? undefined : async (data: ShareData) => {
        probe.native.push({
          title: data.title,
          text: data.text,
          url: data.url,
          files: (data.files ?? []).map((file) => ({ name: file.name, type: file.type, size: file.size })),
        });
        if (settings.native === "abort") throw new DOMException("User cancelled", "AbortError");
        if (settings.native === "error") throw new DOMException("Sharing denied", "NotAllowedError");
      },
    });
  }, options);
}

async function shareProbe(page: Page): Promise<ShareProbe> {
  return page.evaluate(() => Reflect.get(window, "__termsFortuneShareProbe") as ShareProbe);
}

async function expectManualCopy(dialog: Locator) {
  const text = dialog.getByRole("textbox", { name: "共有用テキスト", exact: true });
  await expect(text).toBeVisible();
  await expect(text).toHaveAttribute("readonly", "");
  await expect(text).toHaveValue(new RegExp(TODAY));
  await expect(dialog.getByText("下の文章を選択してコピーしてください。", { exact: true })).toBeVisible();
  await text.focus();
  const selection = await text.evaluate((element: HTMLTextAreaElement) => ({
    start: element.selectionStart,
    end: element.selectionEnd,
    length: element.value.length,
  }));
  expect(selection.start).toBe(0);
  expect(selection.end).toBe(selection.length);
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => {
    const dialog = document.querySelector<HTMLDialogElement>("dialog[open]");
    return {
      viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
      dialog: dialog ? { scroll: dialog.scrollWidth, client: dialog.clientWidth, right: dialog.getBoundingClientRect().right } : null,
    };
  });
  expect(dimensions.document, "document extends beyond the viewport").toBeLessThanOrEqual(dimensions.viewport);
  expect(dimensions.body, "body extends beyond the viewport").toBeLessThanOrEqual(dimensions.viewport);
  if (dimensions.dialog) {
    expect(dimensions.dialog.scroll, "share dialog has horizontal scrolling").toBeLessThanOrEqual(dimensions.dialog.client);
    expect(dimensions.dialog.right, "share dialog is clipped by the viewport").toBeLessThanOrEqual(dimensions.viewport);
  }
}

test("landing exposes the main action, original-parody notice, and both legal disclaimers", async ({ page }) => {
  await visitHome(page);
  await expect(page).toHaveTitle(/利用規約占い/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("今日の運勢は、");
  await expect(page.getByRole("button", { name: DRAW_LABEL, exact: true })).toBeVisible();
  await expect(page.getByText("すべてこのアプリのために書いた、オリジナルのパロディ条文です。", { exact: true })).toBeVisible();
  await expect(page.getByRole("contentinfo")).toContainText("法的効力はありません。法律相談ではありません。");
});

test("a draw survives reload with the same date, clause, rank, and lucky details", async ({ page }) => {
  await freezeDate(page);
  await visitHome(page);
  await drawToday(page);
  await expect(page.getByRole("main")).toBeFocused();
  await expect.poll(() => page.evaluate(() => window.scrollY), {
    message: "Drawing a fortune keeps the top-of-page position after focusing the result",
  }).toBe(0);
  const expected = getFortune(TODAY);
  const article = page.getByRole("article", { name: `${formatJapaneseDate(TODAY)}の占い結果` });
  await expect(page.getByTestId("fortune-clause")).toHaveText(expected.clause.text);
  for (const value of [expected.rank, expected.clause.luckyClause, expected.clause.luckyItem, expected.clause.avoid]) {
    await expect(article).toContainText(value);
  }
  const original = await article.innerText();
  await expectHistory(page, [TODAY]);
  await page.reload();
  await expect(article).toHaveText(original, { useInnerText: true });
  await expectHistory(page, [TODAY]);
});

test("an open current result changes at JST midnight without needing a reload", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-08-27T14:00:00.000Z") });
  await visitHome(page);
  await drawToday(page);
  await expect(page.getByTestId("fortune-clause")).toHaveText(getFortune(TODAY).clause.text);
  await page.clock.setSystemTime(new Date("2026-08-27T14:59:59.000Z"));
  await page.clock.runFor(2_000);
  await expect(page.getByTestId("fortune-clause")).toHaveText(getFortune("2026-08-28").clause.text);
  await expect(page.getByRole("article", { name: `${formatJapaneseDate("2026-08-28")}の占い結果` })).toBeVisible();
  await expectHistory(page, ["2026-08-28", TODAY]);
});

test("history shows exactly seven days and normalizes duplicate, stale, future, and injected storage on save", async ({ page }) => {
  await freezeDate(page);
  await seedStorage(page, {
    [HISTORY_STORAGE_KEY]: JSON.stringify([
      "2026-08-20", "2026-08-28", "invalid", TODAY, "2026-08-25", TODAY,
      { date: "2026-08-21", rank: "大吉" }, "<script>untrusted</script>",
    ]),
  });
  await page.goto("/#history");
  await expect(historyList(page).getByRole("button")).toHaveCount(7);
  await expectViewedCount(page, 2);
  for (const date of getRecentDates(TODAY)) {
    await expect(historyDay(page, date, [TODAY, "2026-08-25"].includes(date))).toBeVisible();
  }
  await historyDay(page, "2026-08-26", false).click();
  await expect(page.getByTestId("fortune-clause")).toHaveText(getFortune("2026-08-26").clause.text);
  await expectHistory(page, [TODAY, "2026-08-26", "2026-08-25"]);
  await openHistory(page);
  await expectViewedCount(page, 3);
  await expect(historyDay(page, "2026-08-26", true)).toBeVisible();
});

test("a recent rare sample is explicitly a sample and never marks its day as viewed", async ({ page }) => {
  // The sample is deliberately inside the seven-day window: otherwise a mistaken
  // history write could be filtered out and conceal the sample/history regression.
  const date = "2026-06-17";
  const sample = getRareExample(date);
  expect(getRecentDates(date)).toContain(sample.date);
  await freezeDate(page, date);
  await seedStorage(page, { [HISTORY_STORAGE_KEY]: JSON.stringify([date]), [THEME_KEY]: "light" });
  await visitHome(page);
  const before = await storageSnapshot(page);
  await page.getByRole("contentinfo").getByRole("link", { name: "大吉の見本", exact: true }).click();
  await expect(page.getByRole("main").getByText(/今日の占い結果ではありません。履歴には保存されません。/)).toBeVisible();
  await expect(page.getByTestId("fortune-clause")).toHaveText(sample.clause.text);
  await expect(page.getByRole("article")).toContainText("全部読んだことにする大吉");
  const dialog = await openShare(page);
  await dialog.getByText("共有用テキストを表示", { exact: true }).click();
  await expect(dialog.getByRole("textbox", { name: "共有用テキスト" })).toHaveValue(/大吉の見本 \/ 今日の結果ではありません/);
  expect(await dialog.getByRole("textbox", { name: "共有用テキスト" }).inputValue()).toContain(`${SITE_URL}/#sample`);
  expect(await storageSnapshot(page)).toEqual(before);
  await dialog.getByRole("button", { name: "共有画面を閉じる", exact: true }).click();
  await page.getByRole("navigation", { name: "メインメニュー" }).getByRole("link", { name: "今日の規約", exact: true }).click();
  await drawToday(page);
  await expect(page.getByTestId("fortune-clause")).toHaveText(getFortune(date).clause.text);
  await expectHistory(page, [date]);
});

test("a shared date link restores its exact historical result instead of today's draw", async ({ page }) => {
  await freezeDate(page);
  const date = "2026-08-24";
  await page.goto(`/?date=${date}#result`);
  await expect(page.getByRole("article", { name: `${formatJapaneseDate(date)}の占い結果` })).toBeVisible();
  await expect(page.getByTestId("fortune-clause")).toHaveText(getFortune(date).clause.text);
  await expectHistory(page, [date]);
  await page.reload();
  await expect(page.getByTestId("fortune-clause")).toHaveText(getFortune(date).clause.text);
});

test("an older valid shared result remains readable but is not retained as recent history", async ({ page }) => {
  await freezeDate(page);
  const date = "2024-02-29";
  await page.goto(`/?date=${date}#result`);
  await expect(page.getByTestId("fortune-clause")).toHaveText(getFortune(date).clause.text);
  await expect(page.getByRole("article")).toHaveAccessibleName(`${formatJapaneseDate(date)}の占い結果`);
  expect(await storedHistory(page)).toBeNull();
});

for (const date of ["2026-02-30", "not-a-date", "2026-8-27", "2026-08-28", "<script>alert(1)</script>"]) {
  test(`invalid or future shared date is rejected: ${date}`, async ({ page }) => {
    await freezeDate(page);
    await page.goto(`/?date=${encodeURIComponent(date)}#result`);
    await expect(page.getByRole("heading", { name: "その日の条文は、開封できません。", level: 1 })).toBeVisible();
    await expect(page.getByTestId("fortune-clause")).toHaveCount(0);
    expect(await storedHistory(page)).toBeNull();
    await page.getByRole("button", { name: "今日の規約へ戻る", exact: true }).click();
    await expect(page.getByRole("button", { name: DRAW_LABEL, exact: true })).toBeEnabled();
  });
}

test("the chosen dark or light theme persists across a reload", async ({ page }) => {
  await visitHome(page);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "ダークモードに切り替える", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await page.evaluate((key) => localStorage.getItem(key), THEME_KEY)).toBe("dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "ライトモードに切り替える", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("X opens the correct encoded intent only; the test intercepts it before any external navigation", async ({ page, context }) => {
  const intercepted: Array<{ url: string; method: string }> = [];
  await context.route(/^https:\/\/x\.com\/intent\/post\?/, async (route) => {
    intercepted.push({ url: route.request().url(), method: route.request().method() });
    await route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>Intercepted X intent</title><p>No post was sent.</p>" });
  });
  await freezeDate(page);
  await visitHome(page);
  await drawToday(page);
  const dialog = await openShare(page);
  const popupPromise = context.waitForEvent("page");
  await dialog.getByRole("button", { name: "Xで共有", exact: true }).click();
  const popup = await popupPromise;
  await expect(popup).toHaveTitle("Intercepted X intent");
  await expect.poll(() => intercepted.length).toBe(1);
  expect(intercepted[0].method).toBe("GET");
  const intent = new URL(intercepted[0].url);
  expect(intent.origin).toBe("https://x.com");
  expect(intent.pathname).toBe("/intent/post");
  const text = intent.searchParams.get("text") ?? "";
  expect(text).toContain(`【${TODAY}の利用規約占い】`);
  expect(text).toContain(getFortune(TODAY).clause.text);
  expect(text).toContain(`運勢：${getFortune(TODAY).rank}`);
  expect(text).toContain("法的効力はありません。法律相談ではありません。");
  expect(text.split(`${SITE_URL}/?date=${TODAY}#result`)).toHaveLength(2);
  await expect(dialog).toBeVisible();
  await popup.close();
});

test("image saving downloads a real 1200px square PNG with its expected file name", async ({ page }, testInfo) => {
  await freezeDate(page);
  await visitHome(page);
  await drawToday(page);
  const save = page.getByRole("button", { name: "画像として保存", exact: true });
  await expect(save).toBeEnabled();
  const downloadPromise = page.waitForEvent("download");
  await save.click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(`terms-fortune-${TODAY}.png`);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const png = Buffer.concat(chunks);
  expect(await download.failure()).toBeNull();
  expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  expect(png.subarray(12, 16).toString("ascii")).toBe("IHDR");
  expect(png.readUInt32BE(16)).toBe(1200);
  expect(png.readUInt32BE(20)).toBe(1200);
  expect(png.length).toBeGreaterThan(10_000);
  await testInfo.attach("downloaded-share-card", { body: png, contentType: "image/png" });
  const dialog = await openShare(page);
  const image = dialog.getByRole("img", { name: /法的効力はありません。法律相談ではありません。/ });
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => [element.naturalWidth, element.naturalHeight])).toEqual([1200, 1200]);
});

test("analytics receives the real interaction calls and excludes every sample action without sending telemetry", async ({ page, context }, testInfo) => {
  type AnalyticsEvent = { name: string; data?: Record<string, string | number | boolean | null> };
  const attemptedTelemetry: string[] = [];
  await context.route(isAnalyticsUrl, async (route) => {
    const script = route.request().resourceType() === "script";
    if (!script) attemptedTelemetry.push(route.request().url());
    await route.fulfill({
      status: script ? 200 : 204,
      contentType: script ? "application/javascript" : "text/plain",
      body: script ? "/* The test observes SDK calls without loading a collector. */" : "",
    });
  });
  // Verified against the installed @vercel/analytics 2.0.1 implementation:
  // initQueue preserves an existing window.va, and track calls va('event', data).
  // This spies on the SDK boundary, not a replacement for trackFortuneEvent.
  await page.addInitScript(() => {
    const events: AnalyticsEvent[] = [];
    Object.defineProperty(window, "__termsFortuneAnalytics", { configurable: true, value: events });
    Object.defineProperty(window, "va", {
      configurable: true,
      value: (command: string, event: AnalyticsEvent) => {
        if (command === "event") events.push(event);
      },
    });
  });
  await context.route(/^https:\/\/x\.com\/intent\/post\?/, (route) => route.fulfill({
    status: 200,
    contentType: "text/html",
    body: "<!doctype html><title>Test-only X intent</title>",
  }));
  async function events(): Promise<AnalyticsEvent[]> {
    return page.evaluate(() => (Reflect.get(window, "__termsFortuneAnalytics") as AnalyticsEvent[])
      .map(({ name, data }) => ({ name, data })));
  }
  async function xIntent(dialog: Locator) {
    const popupPromise = context.waitForEvent("page");
    await dialog.getByRole("button", { name: "Xで共有", exact: true }).click();
    const popup = await popupPromise;
    await expect(popup).toHaveTitle("Test-only X intent");
    await popup.close();
  }
  async function saveImage() {
    const button = page.getByRole("button", { name: "画像として保存", exact: true });
    await expect(button).toBeEnabled();
    const downloadPromise = page.waitForEvent("download");
    await button.click();
    expect(await (await downloadPromise).failure()).toBeNull();
  }

  await mockShareCapabilities(page, { native: "success", clipboard: "success", files: true });
  await freezeDate(page);
  await visitHome(page);
  await drawToday(page);
  await saveImage();
  const dialog = await openShare(page);
  await dialog.getByRole("button", { name: "文章をコピー", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "コピーしました", exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "端末で共有", exact: true }).click();
  await expect.poll(async () => (await shareProbe(page)).native.length).toBe(1);
  await expect(dialog.getByRole("button", { name: "端末で共有", exact: true })).toBeEnabled();
  await xIntent(dialog);
  const expected: AnalyticsEvent[] = [
    { name: "fortune_draw", data: { rank: getFortune(TODAY).rankKey, repeated: false } },
    { name: "image_save", data: { rank: getFortune(TODAY).rankKey, format: "png" } },
    { name: "share", data: { channel: "clipboard", outcome: "copied" } },
    { name: "share", data: { channel: "native", outcome: "completed" } },
    { name: "share", data: { channel: "x", outcome: "intent_opened" } },
  ];
  await expect.poll(events).toEqual(expected);
  await dialog.getByRole("button", { name: "共有画面を閉じる", exact: true }).click();

  await page.getByRole("contentinfo").getByRole("link", { name: "大吉の見本", exact: true }).click();
  await expect(page.getByRole("main").getByText(/今日の占い結果ではありません。履歴には保存されません。/)).toBeVisible();
  await saveImage();
  const sampleDialog = await openShare(page);
  await sampleDialog.getByRole("button", { name: "文章をコピー", exact: true }).click();
  await expect(sampleDialog.getByRole("button", { name: "コピーしました", exact: true })).toBeVisible();
  await sampleDialog.getByRole("button", { name: "端末で共有", exact: true }).click();
  await expect.poll(async () => (await shareProbe(page)).native.length).toBe(2);
  await expect(sampleDialog.getByRole("button", { name: "端末で共有", exact: true })).toBeEnabled();
  await xIntent(sampleDialog);
  expect(await events()).toEqual(expected);
  expect(attemptedTelemetry).toEqual([]);
  await testInfo.attach("custom-event-sdk-calls", {
    body: Buffer.from(JSON.stringify(await events(), null, 2)),
    contentType: "application/json",
  });
});

test("missing native sharing falls back to a successful clipboard copy", async ({ page }) => {
  await mockShareCapabilities(page, { native: "missing", clipboard: "success" });
  await freezeDate(page);
  await visitHome(page);
  await drawToday(page);
  const dialog = await openShare(page);
  await dialog.getByRole("button", { name: "端末で共有", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "コピーしました", exact: true })).toBeVisible();
  const probe = await shareProbe(page);
  expect(probe.native).toEqual([]);
  expect(probe.clipboard).toHaveLength(1);
  expect(probe.clipboard[0]).toContain(getFortune(TODAY).clause.text);
  expect(probe.clipboard[0]).toContain(`${SITE_URL}/?date=${TODAY}#result`);
  expect(probe.clipboard[0]).toContain("法的効力はありません。法律相談ではありません。");
});

for (const clipboard of ["missing", "error"] as const) {
  test(`clipboard ${clipboard} leaves readable, selectable manual-copy text`, async ({ page }) => {
    await mockShareCapabilities(page, { native: "missing", clipboard });
    await freezeDate(page);
    await visitHome(page);
    await drawToday(page);
    const dialog = await openShare(page);
    await dialog.getByRole("button", { name: "文章をコピー", exact: true }).click();
    await expectManualCopy(dialog);
    await expect(dialog).toBeVisible();
  });
}

test("native sharing receives the actual PNG when file sharing is supported", async ({ page }) => {
  await mockShareCapabilities(page, { native: "success", files: true });
  await freezeDate(page);
  await visitHome(page);
  await drawToday(page);
  await expect(page.getByRole("button", { name: "画像として保存", exact: true })).toBeEnabled();
  const dialog = await openShare(page);
  await dialog.getByRole("button", { name: "端末で共有", exact: true }).click();
  await expect.poll(async () => (await shareProbe(page)).native.length).toBe(1);
  const payload = (await shareProbe(page)).native[0];
  expect(payload.title).toBe("利用規約占い");
  expect(payload.text).toContain(getFortune(TODAY).clause.text);
  expect(payload.files).toHaveLength(1);
  expect(payload.files[0].name).toBe(`terms-fortune-${TODAY}.png`);
  expect(payload.files[0].type).toBe("image/png");
  expect(payload.files[0].size).toBeGreaterThan(10_000);
  await expect(dialog.getByRole("button", { name: "端末で共有", exact: true })).toBeEnabled();
});

test("native-share cancellation is quiet and leaves the dialog usable", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await mockShareCapabilities(page, { native: "abort" });
  await visitHome(page);
  await drawToday(page);
  const dialog = await openShare(page);
  await dialog.getByRole("button", { name: "端末で共有", exact: true }).click();
  await expect.poll(async () => (await shareProbe(page)).native.length).toBe(1);
  await expect(dialog.getByRole("button", { name: "端末で共有", exact: true })).toBeEnabled();
  await expect(page.getByText(NATIVE_ERROR, { exact: true })).toHaveCount(0);
  await expect(page.getByText("共有しました。", { exact: true })).toHaveCount(0);
  await expect(dialog).toBeVisible();
  expect(errors).toEqual([]);
});

for (const failure of ["native", "canShare"] as const) {
  test(`${failure} failure is caught, reported, and does not strand the share button`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await mockShareCapabilities(page, {
      native: failure === "native" ? "error" : "success",
      canShareThrows: failure === "canShare",
    });
    await visitHome(page);
    await drawToday(page);
    // Ensure a File exists so the canShare branch is actually exercised.
    await expect(page.getByRole("button", { name: "画像として保存", exact: true })).toBeEnabled();
    const dialog = await openShare(page);
    await dialog.getByRole("button", { name: "端末で共有", exact: true }).click();
    await expect(page.getByText(NATIVE_ERROR, { exact: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "端末で共有", exact: true })).toBeEnabled();
    const probe = await shareProbe(page);
    expect(failure === "native" ? probe.native.length : probe.canShareCalls).toBe(1);
    expect(errors).toEqual([]);
  });
}

test("keyboard users can open the native dialog, stay inside it, Escape, and regain focus", async ({ page }) => {
  await visitHome(page);
  await page.getByRole("button", { name: DRAW_LABEL, exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("fortune-clause")).toBeVisible();
  const trigger = page.getByRole("button", { name: "結果を共有する", exact: true });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: DIALOG_LABEL, exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "共有画面を閉じる", exact: true })).toBeFocused();
  for (const key of ["Shift+Tab", "Tab", "Tab"]) {
    await page.keyboard.press(key);
    await expect.poll(() => dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
});

test("the skip link focuses main content without changing the current history view", async ({ page }) => {
  await page.goto("/#history");
  await expect(page.getByRole("heading", { name: "これまでの条文", level: 1 })).toBeVisible();
  await page.getByRole("link", { name: "本文へスキップ", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
  await expect(page).toHaveURL(/#history$/);
  await expect(page.getByRole("heading", { name: "これまでの条文", level: 1 })).toBeVisible();
});

test("clearing viewed history in one tab immediately clears the other tab's viewed markers", async ({ page, context }) => {
  await freezeDate(page);
  await visitHome(page);
  await drawToday(page);
  await openHistory(page);
  const other = await context.newPage();
  try {
    await freezeDate(other);
    await other.goto("/#history");
    await expectViewedCount(other, 1);
    await page.getByRole("button", { name: "この端末の確認履歴を削除", exact: true }).click();
    await page.getByRole("button", { name: "確認履歴を削除", exact: true }).click();
    await expectViewedCount(page, 0);
    await expectViewedCount(other, 0);
    await expect(historyDay(other, TODAY, false)).toBeVisible();
    expect(await storedHistory(other)).toBeNull();
  } finally {
    await other.close();
  }
});

for (const width of [320, 390]) {
  test(`landing, result, share card, and history fit a ${width}px viewport without horizontal overflow`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await visitHome(page);
    await expectNoHorizontalOverflow(page);
    await drawToday(page);
    await expect(page.getByRole("button", { name: "画像として保存", exact: true })).toBeEnabled();
    await expectNoHorizontalOverflow(page);
    const dialog = await openShare(page);
    await expect(dialog.getByRole("img")).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await dialog.getByRole("button", { name: "共有画面を閉じる", exact: true }).click();
    await openHistory(page);
    await expectNoHorizontalOverflow(page);
  });
}

test("a prepared production service worker supports an offline reload, draw, image, and persisted history", async ({ page, context }) => {
  test.setTimeout(90_000);
  const observedStaticUrls = new Set<string>();
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.pathname.startsWith("/_next/static/")
      && ["script", "stylesheet"].includes(response.request().resourceType())) {
      observedStaticUrls.add(url.href);
    }
  });
  await freezeDate(page);
  await visitHome(page);
  await expect.poll(() => page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration("/");
    return registration?.active?.state === "activated" && Boolean(navigator.serviceWorker.controller);
  }), { timeout: 30_000, message: "The production service worker must install and control the page" }).toBe(true);

  await drawToday(page);
  await openHistory(page);
  await historyDay(page, "2026-08-26", false).click();
  await expect(page.getByTestId("fortune-clause")).toHaveText(getFortune("2026-08-26").clause.text);
  await page.getByRole("navigation", { name: "メインメニュー" }).getByRole("link", { name: "今日の規約", exact: true }).click();
  // Clock emulation can empty PerformanceResourceTiming. Read the real initial
  // DOM assets plus observed JS/CSS responses instead; all must be in the app's
  // own cache before disconnecting. The test never seeds or repairs that cache.
  await expect.poll(() => page.evaluate(async (observedUrls) => {
    const initialScripts = Array.from(document.querySelectorAll<HTMLScriptElement>("script[src]"))
      .map((script) => script.src);
    const initialStyles = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][href]'))
      .map((link) => link.href);
    const preloads = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="modulepreload"][href], link[rel="preload"][as="script"][href]'))
      .map((link) => link.href);
    const isStatic = (value: string) => {
      const url = new URL(value, location.href);
      return url.origin === location.origin && url.pathname.startsWith("/_next/static/");
    };
    if (!initialScripts.some(isStatic) || !initialStyles.some(isStatic) || !(await caches.match("/"))) return false;
    const resources = [...new Set([...initialScripts, ...initialStyles, ...preloads, ...observedUrls])]
      .filter(isStatic);
    const cached = await Promise.all(resources.map((url) => caches.match(url)));
    return cached.every(Boolean);
  }, [...observedStaticUrls]), { timeout: 30_000, message: "All initial and loaded first-party JS/CSS must be cached before going offline" }).toBe(true);

  await context.setOffline(true);
  try {
    // Chrome's CDP emulation can reset navigator.onLine on a cached reload while
    // network requests remain disabled. Check the indicator at the offline event;
    // keep the context offline for both reloads and every functional check below.
    await expect(page.getByRole("status").filter({ hasText: "オフラインです。" })).toBeVisible();
    const response = await page.reload({ waitUntil: "domcontentloaded" });
    expect(response?.fromServiceWorker()).toBe(true);
    await expect(page.getByRole("button", { name: DRAW_LABEL, exact: true })).toBeEnabled();
    await drawToday(page);
    await expect(page.getByTestId("fortune-clause")).toHaveText(getFortune(TODAY).clause.text);
    await expect(page.getByRole("button", { name: "画像として保存", exact: true })).toBeEnabled();
    await openHistory(page);
    await expectViewedCount(page, 2);
    await expect(historyDay(page, "2026-08-26", true)).toBeVisible();
    await historyDay(page, "2026-08-25", false).click();
    await expectHistory(page, [TODAY, "2026-08-26", "2026-08-25"]);
    const historicalResponse = await page.reload({ waitUntil: "domcontentloaded" });
    expect(historicalResponse?.fromServiceWorker()).toBe(true);
    await expect(page.getByTestId("fortune-clause")).toHaveText(getFortune("2026-08-25").clause.text);
    await openHistory(page);
    await expectViewedCount(page, 3);
  } finally {
    await context.setOffline(false);
  }
});
