/**
 * Public deployment smoke test. Uses real dates and a fresh browser profile.
 * Never posts to X, reads/writes the clipboard, or seeds localStorage.
 * Analytics evidence is HTTP transport only, not dashboard aggregation.
 * Usage: node scripts/verify-published.mjs https://your-public-app.vercel.app
 */
import { chromium, expect } from "@playwright/test";
import { lookup } from "node:dns/promises";
import { mkdir, writeFile } from "node:fs/promises";
import { BlockList, isIP } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const reportPath = join(projectRoot, ".cache", "published-verification.json");
const requiredPaths = [
  "/", "/manifest.webmanifest", "/robots.txt", "/sitemap.xml", "/sw.js",
  "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png", "/favicon.ico", "/og.png",
];

function ensure(condition, message, verificationType = "verification") {
  if (!condition) {
    const error = new Error(message);
    error.name = "VerificationError";
    error.verificationType = verificationType;
    throw error;
  }
}

function requestedOrigin() {
  ensure(process.argv.length === 3, "Pass exactly one public HTTPS origin.");
  const url = new URL(process.argv[2]);
  ensure(url.protocol === "https:" && !url.username && !url.password, "Only credential-free HTTPS is allowed.");
  ensure(!url.port || url.port === "443", "Only the standard HTTPS port is allowed.");
  ensure(url.pathname === "/" && !url.search && !url.hash, "Pass an origin without a path, query, or fragment.");
  ensure(url.hostname.includes(".") && !isIP(url.hostname), "Use the public deployment's DNS hostname.");
  ensure(!/(?:^|\.)(?:localhost|local|internal|test|invalid)$/i.test(url.hostname), "Local/private hostnames are not allowed.");
  return url.origin;
}

async function requirePublicDns(origin) {
  const blocked = new BlockList();
  for (const [address, prefix] of [
    ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
    ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
    ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24],
    ["224.0.0.0", 4], ["240.0.0.0", 4],
  ]) blocked.addSubnet(address, prefix, "ipv4");
  // BlockList normalizes IPv4 to IPv4-mapped IPv6 internally. Blocking the
  // entire ::ffff:0:0/96 range would therefore reject every public IPv4 too.
  // The IPv4 rules above also reject mapped private/loopback IPv6 addresses.
  for (const [address, prefix] of [
    ["::", 128], ["::1", 128], ["fc00::", 7],
    ["fe80::", 10], ["ff00::", 8], ["2001:db8::", 32],
  ]) blocked.addSubnet(address, prefix, "ipv6");
  let addresses;
  try {
    addresses = await lookup(new URL(origin).hostname, { all: true });
  } catch {
    ensure(false, "Public-host DNS lookup failed.", "dns-lookup-failed");
  }
  ensure(addresses.length > 0, "The hostname has no address records.", "dns-no-addresses");
  ensure(addresses.every(({ address, family }) =>
    !blocked.check(address, family === 6 ? "ipv6" : "ipv4")), "The hostname must resolve only to public addresses.", "dns-non-public-address");
  // Resolved addresses are intentionally not recorded.
}

function pngSize(bytes) {
  ensure(bytes.length >= 24 && bytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a", "An expected PNG is invalid.");
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

function analyticsEndpoint(url, origin) {
  return (url.origin === origin && url.pathname.startsWith("/_vercel/insights/"))
    || /(?:^|\.)vercel-insights\.com$/i.test(url.hostname)
    || url.hostname === "va.vercel-scripts.com";
}

function analyticsUrl(value, origin) {
  try {
    if (!value) return null;
    const url = new URL(value, origin);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    // Never retain query parameters, fragments, DSNs, or SDK configuration.
    return `${url.origin}${url.pathname}`;
  } catch { return null; }
}

async function main() {
  const origin = requestedOrigin();
  const report = {
    origin, startedAt: new Date().toISOString(), status: "running", checks: [], resources: [],
    pageErrorCount: 0, warnings: [],
    analytics: {
      script: { url: `${origin}/_vercel/insights/script.js`, status: null },
      legacyScriptProbe: { url: `${origin}/_vercel/insights/script.js`, status: null },
      viewEndpoints: [], browserIsAutomated: null, transportNotVerifiedReason: null,
      observations: [], pageviewHttpAccepted: false, dashboardAggregationVerified: false,
      customEvents: "Not required by this smoke test; the current Hobby plan does not aggregate custom events.",
    },
  };
  let browser;
  let successful = false;

  async function check(name, action) {
    try {
      await action();
      report.checks.push({ name, status: "passed" });
      console.log(`PASS ${name}`);
    } catch (error) {
      // Locator errors can contain DOM snippets. Do not persist error messages,
      // stacks, response bodies, headers, request payloads, or visitor IDs.
      const errorType = ["dns-lookup-failed", "dns-no-addresses", "dns-non-public-address"].includes(error?.verificationType)
        ? error.verificationType : error?.name === "TimeoutError" ? "timeout" : "verification";
      report.checks.push({ name, status: "failed", errorType });
      console.error(`FAIL ${name} (${errorType})`);
      throw error;
    }
  }

  try {
    await check("public-https-origin", () => requirePublicDns(origin));
    const resources = new Map();
    await check("required-public-resources-return-200", async () => {
      const results = await Promise.all(requiredPaths.map(async (path) => {
        const url = `${origin}${path}`;
        try {
          const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(20_000) });
          report.resources.push({ url, status: response.status });
          if (response.status !== 200) { await response.body?.cancel(); return false; }
          const bytes = Buffer.from(await response.arrayBuffer());
          ensure(bytes.length > 0 && bytes.length <= 8_000_000, "An asset is empty or unexpectedly large.");
          resources.set(path, bytes);
          return true;
        } catch {
          if (!report.resources.some((entry) => entry.url === url)) report.resources.push({ url, status: null });
          return false;
        }
      }));
      ensure(results.every(Boolean), "One or more required resources could not be verified.");
    });

    await check("png-dimensions-and-favicon", async () => {
      for (const [path, width, height] of [
        ["/icon-192.png", 192, 192], ["/icon-512.png", 512, 512],
        ["/apple-touch-icon.png", 180, 180], ["/og.png", 1200, 630],
      ]) {
        const size = pngSize(resources.get(path));
        ensure(size[0] === width && size[1] === height, "A published image has incorrect dimensions.");
      }
      const ico = resources.get("/favicon.ico");
      ensure(ico.length >= 22 && ico.readUInt16LE(0) === 0 && ico.readUInt16LE(2) === 1, "The favicon is not a valid ICO.");
      const count = ico.readUInt16LE(4);
      ensure(count > 0 && ico.length >= 6 + count * 16, "The favicon directory is invalid.");
      for (let index = 0; index < count; index += 1) {
        const entry = 6 + index * 16;
        ensure(ico.readUInt32LE(entry + 8) > 0 && ico.readUInt32LE(entry + 12) + ico.readUInt32LE(entry + 8) <= ico.length, "A favicon entry is incomplete.");
      }
    });

    await check("manifest-robots-sitemap-and-service-worker", async () => {
      const manifest = JSON.parse(resources.get("/manifest.webmanifest").toString("utf8"));
      ensure(manifest.display === "standalone" && manifest.name === "利用規約占い", "The PWA manifest is incorrect.");
      for (const field of ["start_url", "scope"]) ensure(new URL(manifest[field], origin).href === `${origin}/`, "PWA scope/start URL must use the published origin.");
      ensure(Array.isArray(manifest.icons), "PWA icons are missing.");
      for (const size of [192, 512]) {
        ensure(manifest.icons.some((icon) => icon.sizes === `${size}x${size}` && icon.type === "image/png"
          && new URL(icon.src, origin).href === `${origin}/icon-${size}.png`), "A required PWA icon is missing.");
      }
      ensure(manifest.icons.some((icon) => icon.sizes === "512x512" && icon.purpose?.split(/\s+/).includes("maskable")), "A maskable PWA icon is missing.");
      const robots = resources.get("/robots.txt").toString("utf8");
      ensure(robots.match(/^Sitemap:\s*(\S+)/im)?.[1] === `${origin}/sitemap.xml`, "Robots references a different sitemap origin.");
      const locations = [...resources.get("/sitemap.xml").toString("utf8").matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => new URL(match[1]));
      ensure(locations.length > 0 && locations.every((url) => url.origin === origin) && locations.some((url) => url.pathname === "/"), "Sitemap entries do not match the published origin.");
      ensure(/addEventListener\(["']fetch["']/.test(resources.get("/sw.js").toString("utf8")), "The public service worker has no fetch handler.");
    });

    // This legacy-path probe is informational, not proof that the runtime uses
    // this script. Vercel can rewrite Analytics to an opaque first-party path.
    try {
      const response = await fetch(report.analytics.legacyScriptProbe.url, { redirect: "manual", signal: AbortSignal.timeout(15_000) });
      report.analytics.legacyScriptProbe.status = response.status;
      await response.body?.cancel();
    } catch { /* Recorded below as an analytics warning, not a functional failure. */ }

    await check("headless-browser-start", async () => {
      browser = await chromium.launch({ channel: process.env.E2E_BROWSER_CHANNEL || "chrome", headless: true });
    });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 }, locale: "ja-JP", timezoneId: "Asia/Tokyo",
      colorScheme: "light", reducedMotion: "reduce", serviceWorkers: "allow", permissions: [],
    });
    const page = await context.newPage();
    page.setDefaultTimeout(12_000);
    page.setDefaultNavigationTimeout(30_000);
    page.on("pageerror", () => { report.pageErrorCount += 1; });
    let pageviewReceived;
    const pageviewArrival = new Promise((resolveArrival) => { pageviewReceived = resolveArrival; });
    const scriptUrls = new Set([`${origin}/_vercel/insights/script.js`]);
    const viewUrls = new Set([`${origin}/_vercel/insights/view`]);
    const candidates = [];
    const recorded = new Set();
    let analyticsResolved = false;

    function recordAnalytics(candidate) {
      const url = new URL(candidate.url);
      const legacy = analyticsEndpoint(url, origin);
      const isView = candidate.method === "POST" && (viewUrls.has(candidate.url) || (legacy && /\/view\/?$/.test(url.pathname)));
      const isScript = candidate.method === "GET" && (scriptUrls.has(candidate.url) || (legacy && /\/script(?:\.debug)?\.js$/.test(url.pathname)));
      if (!isView && !isScript) return;
      const key = `${candidate.method}|${candidate.url}|${candidate.status}`;
      if (recorded.has(key)) return;
      recorded.add(key);
      report.analytics.observations.push({ kind: isView ? "pageview" : "script", ...candidate });
      if (isScript && candidate.url === report.analytics.script.url) report.analytics.script.status = candidate.status;
      if (isView && candidate.status >= 200 && candidate.status < 300) {
        report.analytics.pageviewHttpAccepted = true;
        pageviewReceived();
      }
    }

    function observeAnalytics(url, method, status, resourceType) {
      if (method !== "POST" && !(method === "GET" && resourceType === "script")) return;
      const normalized = analyticsUrl(url, origin);
      if (!normalized) return;
      const candidate = { url: normalized, method, status };
      // These anonymous candidates exist only in memory. They are filtered
      // against the actual SDK script's endpoints before entering the report.
      if (candidates.length < 200) candidates.push(candidate);
      if (analyticsResolved) recordAnalytics(candidate);
    }

    // Subscribe before goto so fast script loads and initial pageview requests
    // are not lost while React adds the Analytics script to the document.
    page.on("response", (response) => {
      const request = response.request();
      observeAnalytics(response.url(), request.method(), response.status(), request.resourceType());
    });
    page.on("requestfailed", (request) => {
      observeAnalytics(request.url(), request.method(), null, request.resourceType());
    });

    async function resolveRuntimeAnalytics() {
      const scripts = page.locator('script[data-sdkn^="@vercel/analytics"]');
      try {
        await scripts.first().waitFor({ state: "attached", timeout: 5_000 });
        // Read only endpoint URLs. In particular, never read data-dsn or copy
        // the complete dataset/SDK configuration into Node or the report.
        const endpoints = await scripts.evaluateAll((elements) => elements.map((script) => ({
          src: script.getAttribute("src"),
          view: script.getAttribute("data-view-endpoint"),
          base: script.getAttribute("data-endpoint"),
        })));
        for (const endpoint of endpoints) {
          const src = analyticsUrl(endpoint.src, origin);
          if (src) {
            scriptUrls.add(src);
            report.analytics.script = { url: src, status: null };
          }
          const view = analyticsUrl(endpoint.view, origin);
          const base = analyticsUrl(endpoint.base, origin);
          if (view) viewUrls.add(view);
          else if (base) viewUrls.add(`${base.replace(/\/+$/, "")}/view`);
        }
      } catch {
        report.warnings.push("Analytics runtime endpoint configuration was not observed; legacy matching was retained.");
      }
      report.analytics.viewEndpoints = [...viewUrls];
      report.analytics.browserIsAutomated = await page.evaluate(() =>
        navigator.webdriver === true || navigator.userAgent.includes("Headless"));
      // This is read-only detection: no UA, WebDriver, clock, or storage
      // spoofing is used to manufacture traffic that Analytics would exclude.
      analyticsResolved = true;
      for (const candidate of candidates) recordAnalytics(candidate);
    }

    await check("landing-and-origin-metadata", async () => {
      const response = await page.goto(origin, { waitUntil: "domcontentloaded" });
      ensure(response?.status() === 200 && new URL(page.url()).origin === origin, "The browser did not reach the published app.");
      await expect(page.getByRole("button", { name: "今日の利用規約を確認する", exact: true })).toBeEnabled();
      await expect(page.getByRole("heading", { level: 1 })).toContainText("今日の運勢は、");
      for (const selector of ['link[rel="canonical"]', 'meta[property="og:url"]']) {
        const value = await page.locator(selector).getAttribute(selector.startsWith("link") ? "href" : "content");
        ensure(value && new URL(value, origin).href === `${origin}/`, "Canonical or Open Graph URL does not match the published origin.");
      }
      const ogImage = await page.locator('meta[property="og:image"]').getAttribute("content");
      ensure(ogImage && new URL(ogImage, origin).href === `${origin}/og.png`, "Open Graph image points to the wrong origin.");
      const manifestHref = await page.locator('link[rel="manifest"]').getAttribute("href");
      ensure(manifestHref && new URL(manifestHref, origin).href === `${origin}/manifest.webmanifest`, "The manifest link is incorrect.");
      await expect(page.getByText("法的効力はありません。法律相談ではありません。", { exact: true })).toBeVisible();
    });
    await resolveRuntimeAnalytics();

    await check("today-result-and-three-lucky-details", async () => {
      await page.getByRole("button", { name: "今日の利用規約を確認する", exact: true }).click();
      await expect(page.getByTestId("fortune-clause")).toBeVisible();
      await expect(page.locator(".lucky-detail")).toHaveCount(3);
      for (const label of ["ラッキー条項", "ラッキーアイテム", "今日やってはいけないこと"]) {
        await expect(page.getByText(label, { exact: true })).toBeVisible();
      }
      for (const detail of await page.locator(".lucky-detail").all()) {
        ensure((await detail.locator("p").last().textContent())?.trim(), "A result detail is empty.");
      }
    });

    await check("share-dialog-has-real-1200px-image-and-closes", async () => {
      await page.getByRole("button", { name: "結果を共有する", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "運勢を、おすそわけ。" });
      const image = dialog.getByRole("img");
      await expect(image).toBeVisible();
      await expect.poll(() => image.evaluate((element) => element.complete && element.naturalWidth === 1200 && element.naturalHeight === 1200)).toBe(true);
      await dialog.getByRole("button", { name: "共有画面を閉じる", exact: true }).click();
      await expect(dialog).toHaveCount(0);
    });

    await check("rare-sample-explicitly-not-todays-result", async () => {
      await page.getByRole("link", { name: "大吉の見本", exact: true }).click();
      await expect(page.getByText("全部読んだことにする大吉", { exact: true })).toBeVisible();
      await expect(page.locator(".sample-banner")).toContainText("今日の占い結果ではありません");
      await expect(page.locator(".sample-banner")).toContainText("履歴には保存されません");
    });

    await check("history-and-dark-mode", async () => {
      await page.getByRole("navigation", { name: "メインメニュー" }).getByRole("link", { name: "これまでの条文", exact: true }).click();
      await expect(page.getByRole("heading", { level: 1, name: "これまでの条文", exact: true })).toBeVisible();
      await expect(page.locator(".history-row")).toHaveCount(7);
      await expect(page.locator(".history-row.was-viewed")).toHaveCount(1);
      await page.getByRole("button", { name: "ダークモードに切り替える", exact: true }).click();
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    });

    await check("390px-history-home-and-result-do-not-overflow", async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      const noOverflow = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
      await expect.poll(noOverflow).toBe(true);
      await page.getByRole("link", { name: "利用規約占い トップへ", exact: true }).click();
      await expect(page.getByRole("button", { name: "今日の利用規約を確認する", exact: true })).toBeEnabled();
      await expect.poll(noOverflow).toBe(true);
      await page.getByRole("button", { name: "今日の利用規約を確認する", exact: true }).click();
      await expect(page.getByTestId("fortune-clause")).toBeVisible();
      await expect.poll(noOverflow).toBe(true);
    });

    await check("installed-service-worker-controls-public-page", async () => {
      await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller), undefined, { timeout: 20_000 });
      const state = await page.evaluate(async () => {
        const registration = await navigator.serviceWorker.getRegistration("/");
        return { scope: registration?.scope, script: navigator.serviceWorker.controller?.scriptURL };
      });
      ensure(state.scope === `${origin}/` && state.script === `${origin}/sw.js`, "The published app is not controlled by its own service worker.");
    });

    let analyticsTimer;
    try {
      await Promise.race([pageviewArrival, new Promise((resolveWait) => { analyticsTimer = setTimeout(resolveWait, 8_000); })]);
    } finally { clearTimeout(analyticsTimer); }
    await check("no-uncaught-browser-page-errors", async () => ensure(report.pageErrorCount === 0, "The browser raised an uncaught page error."));
    successful = true;
  } catch {
    // The failed check is the evidence; do not save potentially sensitive errors.
  } finally {
    if (browser) {
      try { await browser.close(); } catch { report.warnings.push("Browser cleanup could not be confirmed."); }
    }
    if (report.analytics.script.status !== 200) report.warnings.push("Analytics script HTTP 200 was not verified.");
    if (!report.analytics.pageviewHttpAccepted) {
      report.analytics.transportNotVerifiedReason = report.analytics.browserIsAutomated
        ? "Automated browser detected. The deployed Analytics script excludes webdriver/Headless clients; no identity spoofing was used."
        : "No successful pageview HTTP response was observed.";
      report.warnings.push(report.analytics.browserIsAutomated
        ? "Analytics excludes automated browsers: pageview HTTP acceptance and dashboard aggregation remain unverified (expected; no spoofing)."
        : "No successful real pageview HTTP response was observed; dashboard aggregation was not verified.");
    }
    report.status = successful ? (report.warnings.length ? "passed_with_warnings" : "passed") : "failed";
    report.finishedAt = new Date().toISOString();
    report.resources.sort((left, right) => left.url.localeCompare(right.url));
    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    for (const warning of report.warnings) console.warn(`WARN ${warning}`);
    console.log(`${report.status.toUpperCase()}: .cache/published-verification.json`);
    if (!successful) process.exitCode = 1;
  }
}

main().catch(() => {
  console.error("Verification could not start or write its report. Usage: node scripts/verify-published.mjs https://your-public-app.vercel.app");
  process.exitCode = 1;
});
