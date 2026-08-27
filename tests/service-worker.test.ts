import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Script } from "node:vm";

const ORIGIN = "https://terms-fortune.test";
const SOURCE = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");

type WorkerRequest = { url: string; method: string; mode: string };
type CacheKey = string | WorkerRequest;
type FetchEvent = {
  request: WorkerRequest;
  respondWith: (response: Response | Promise<Response>) => void;
};
type CacheFailure = "open" | "match" | "put";
type Options = {
  cacheFailure?: CacheFailure;
  cachedResponse?: Response;
  networkResponse?: Response;
  offline?: boolean;
};

function request(path: string, mode = "cors", method = "GET"): WorkerRequest {
  // Node's Request constructor deliberately disallows mode="navigate"; the
  // worker only reads these three standard request fields, so model them here.
  return { url: new URL(path, ORIGIN).href, method, mode };
}

function worker(options: Options = {}) {
  const handlers = new Map<string, (event: FetchEvent) => void>();
  const calls = {
    open: [] as string[],
    match: [] as CacheKey[],
    put: [] as { key: CacheKey; body: string }[],
    fetch: [] as WorkerRequest[],
  };
  const networkResponse = options.networkResponse ?? new Response("fresh network response");
  const cache = {
    async match(key: CacheKey) {
      calls.match.push(key);
      if (options.cacheFailure === "match") throw new Error("Cache lookup unavailable");
      return options.cachedResponse?.clone();
    },
    async put(key: CacheKey, response: Response) {
      if (options.cacheFailure === "put") throw new Error("QuotaExceededError");
      // Consume the cached copy, just as a real cache does, to catch accidental
      // reuse of the original Response without cloning it first.
      calls.put.push({ key, body: await response.text() });
    },
  };

  new Script(SOURCE, { filename: "public/sw.js" }).runInNewContext({
    URL,
    Response,
    self: {
      location: { origin: ORIGIN },
      addEventListener(name: string, handler: (event: FetchEvent) => void) {
        handlers.set(name, handler);
      },
    },
    caches: {
      async open(name: string) {
        calls.open.push(name);
        if (options.cacheFailure === "open") throw new Error("Cache storage unavailable");
        return cache;
      },
    },
    async fetch(value: WorkerRequest) {
      calls.fetch.push(value);
      if (options.offline) throw new TypeError("Network unavailable");
      return networkResponse;
    },
  });

  const onFetch = handlers.get("fetch");
  assert.ok(onFetch, "The service worker must register a fetch handler");

  return {
    calls,
    dispatch(value: WorkerRequest): Promise<Response> | undefined {
      let response: Promise<Response> | undefined;
      onFetch({
        request: value,
        respondWith(promise) {
          assert.equal(response, undefined, "A request must be intercepted only once");
          response = Promise.resolve(promise);
        },
      });
      return response;
    },
  };
}

for (const failure of ["open", "match", "put"] as const) {
  test(`a rejected cache.${failure} cannot break a successfully fetched JS asset`, async () => {
    const source = 'console.log("local application");';
    const fresh = new Response(source, {
      headers: { "content-type": "application/javascript", "x-result": "network" },
    });
    const instance = worker({ cacheFailure: failure, networkResponse: fresh });
    const asset = request("/_next/static/chunks/app-test.js");
    const response = await instance.dispatch(asset);

    assert.equal(response, fresh);
    assert.equal(response.headers.get("x-result"), "network");
    assert.equal(await response.text(), source);
    assert.deepEqual(instance.calls.fetch, [asset]);
  });
}

for (const failure of ["open", "put"] as const) {
  test(`a rejected cache.${failure} cannot break successful root navigation`, async () => {
    const fresh = new Response("<main>The current app</main>", {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
    const instance = worker({ cacheFailure: failure, networkResponse: fresh });
    const navigation = request("/?date=2026-08-27", "navigate");
    const response = await instance.dispatch(navigation);

    assert.equal(response, fresh);
    assert.equal(await response.text(), "<main>The current app</main>");
    assert.deepEqual(instance.calls.fetch, [navigation]);
  });
}

test("normal online navigation saves a clone under the query-independent root key", async () => {
  const instance = worker({ networkResponse: new Response("<main>Updated app</main>") });
  const response = await instance.dispatch(request("/?date=2026-08-26", "navigate"));

  assert.ok(response);
  assert.equal(await response.text(), "<main>Updated app</main>");
  assert.deepEqual(instance.calls.put, [{ key: "/", body: "<main>Updated app</main>" }]);
});

test("offline navigation with a date query falls back to the saved root document", async () => {
  const instance = worker({ offline: true, cachedResponse: new Response("<main>Saved app</main>") });
  const navigation = request("/?date=2026-08-26", "navigate");
  const response = await instance.dispatch(navigation);

  assert.ok(response);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "<main>Saved app</main>");
  assert.deepEqual(instance.calls.match, ["/"]);
  assert.deepEqual(instance.calls.fetch, [navigation]);
  assert.equal(instance.calls.put.length, 0);
});

for (const failure of ["open", "match"] as const) {
  test(`offline navigation with rejected cache.${failure} returns a network-error response`, async () => {
    const instance = worker({ offline: true, cacheFailure: failure });
    const response = await instance.dispatch(request("/", "navigate"));

    assert.ok(response);
    assert.equal(response.type, "error");
    assert.equal(response.status, 0);
  });
}

test("offline navigation without a saved document returns a network-error response", async () => {
  const instance = worker({ offline: true });
  const response = await instance.dispatch(request("/", "navigate"));

  assert.ok(response);
  assert.equal(response.type, "error");
});

for (const path of ["/_next/static/chunks/app-test.js", "/icon-192.png", "/manifest.webmanifest"]) {
  test(`a saved ${path} remains usable offline without any network call`, async () => {
    const instance = worker({ offline: true, cachedResponse: new Response("saved asset") });
    const asset = request(path);
    const response = await instance.dispatch(asset);

    assert.ok(response);
    assert.equal(await response.text(), "saved asset");
    assert.deepEqual(instance.calls.match, [asset]);
    assert.equal(instance.calls.fetch.length, 0);
    assert.equal(instance.calls.put.length, 0);
  });
}

test("an unsuccessful asset response is returned but never added to the cache", async () => {
  const missing = new Response("Not found", { status: 404 });
  const instance = worker({ networkResponse: missing });
  const response = await instance.dispatch(request("/_next/static/chunks/missing.js"));

  assert.equal(response, missing);
  assert.equal(response.status, 404);
  assert.equal(instance.calls.put.length, 0);
});

const untouched = [
  request("/_vercel/insights/script.js"),
  request("/_vercel/insights/view"),
  request("/_vercel/insights/event", "cors", "POST"),
  request("https://external.example/_next/static/chunks/app.js"),
  request("https://external.example/", "navigate"),
  request("/", "navigate", "POST"),
  request("/_next/static/chunks/app.js", "cors", "PUT"),
  request("/icon-192.png", "cors", "HEAD"),
  request("/api/example"),
];

for (const value of untouched) {
  test(`leaves ${value.method} ${value.url} entirely to the browser`, () => {
    const instance = worker();

    assert.equal(instance.dispatch(value), undefined);
    assert.equal(instance.calls.open.length, 0);
    assert.equal(instance.calls.match.length, 0);
    assert.equal(instance.calls.put.length, 0);
    assert.equal(instance.calls.fetch.length, 0);
  });
}
