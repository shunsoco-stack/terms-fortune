import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, "public", "screenshots");
const requested = process.argv[2];
if (!requested) throw new Error("Pass the verified public HTTPS URL as the first argument.");
const origin = new URL(requested);
if (origin.protocol !== "https:" || origin.username || origin.password) {
  throw new Error("Screenshots must come from a public HTTPS app without credentials.");
}
await mkdir(output, { recursive: true });

const browser = await chromium.launch({ channel: process.env.E2E_BROWSER_CHANNEL || "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1120 }, deviceScaleFactor: 1,
  colorScheme: "light", reducedMotion: "reduce", locale: "ja-JP", timezoneId: "Asia/Tokyo",
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const records = [];

async function capture(name, locator) {
  await page.evaluate(() => document.fonts.ready);
  if (locator) await locator.screenshot({ path: join(output, name), animations: "disabled" });
  else await page.screenshot({ path: join(output, name), fullPage: true, animations: "disabled" });
  records.push({ file: name, url: page.url(), capturedAt: new Date().toISOString() });
  console.log(`Captured ${name} from ${page.url()}`);
}

async function openHistory() {
  await page.getByRole("navigation", { name: "メインメニュー" }).getByRole("link", { name: "これまでの条文" }).click();
  await expect(page.getByRole("heading", { name: "これまでの条文", exact: true })).toBeVisible();
}

try {
  await page.goto(origin.origin, { waitUntil: "networkidle" });
  await expect(page.getByRole("button", { name: "今日の利用規約を確認する", exact: true })).toBeEnabled();
  await capture("01-home.png");

  await page.getByRole("button", { name: "今日の利用規約を確認する", exact: true }).click();
  await expect(page.getByRole("button", { name: "画像として保存", exact: true })).toBeEnabled();
  await capture("02-result.png");

  await page.getByRole("button", { name: "結果を共有する", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "運勢を、おすそわけ。" });
  await expect(dialog.getByRole("img")).toBeVisible();
  await capture("04-share.png", dialog);
  await dialog.getByRole("button", { name: "共有画面を閉じる" }).click();

  await page.getByRole("link", { name: "大吉の見本", exact: true }).click();
  await expect(page.getByText("全部読んだことにする大吉", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "画像として保存", exact: true })).toBeEnabled();
  await capture("03-daikichi.png");

  await openHistory();
  // Build a truthful history by actually opening each of the previous six days.
  // This is a fresh browser profile, not fabricated or injected history data.
  for (let index = 1; index < 7; index += 1) {
    await page.locator(".history-row").nth(index).click();
    await expect(page.getByTestId("fortune-clause")).toBeVisible();
    await openHistory();
  }
  await expect(page.locator(".history-row.was-viewed")).toHaveCount(7);
  await capture("05-history.png");

  if (errors.length) throw new Error(`Browser errors: ${errors.join("; ")}`);
  await writeFile(join(output, "capture-info.json"), `${JSON.stringify({
    source: origin.origin, viewport: { width: 1440, height: 1120 },
    browser: { channel: process.env.E2E_BROWSER_CHANNEL || "chrome", version: browser.version() },
    history: "Seven actual dated results opened through the UI in a fresh profile.",
    rare: "Clearly labelled sample; not today's result and never saved to history.",
    screenshots: records.sort((a, b) => a.file.localeCompare(b.file)),
  }, null, 2)}\n`, "utf8");
} finally {
  await context.close();
  await browser.close();
}
