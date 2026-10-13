import { describe, expect, it } from "vitest";
import { createFetchCache } from "./fetchCache";

type FetchImpl = typeof fetch;

/** A fetch stand-in that counts calls and answers with the given body. */
function fakeFetch(body: unknown, status = 200) {
  const calls: string[] = [];
  const impl = (async (input: RequestInfo | URL) => {
    calls.push(String(input));
    return new Response(JSON.stringify(body), { status });
  }) as FetchImpl;
  return { impl, calls };
}

/** A fetch stand-in that resolves only when the test says so. */
function deferredFetch(body: unknown) {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const calls: string[] = [];
  const impl = (async (input: RequestInfo | URL) => {
    calls.push(String(input));
    await gate;
    return new Response(JSON.stringify(body), { status: 200 });
  }) as FetchImpl;
  return { impl, calls, release };
}

describe("createFetchCache", () => {
  it("peek is undefined before a load and the parsed body after", async () => {
    const { impl } = fakeFetch({ total: 3 });
    const cache = createFetchCache(impl);

    expect(cache.peek("/api/catalog")).toBeUndefined();
    await cache.load("/api/catalog");
    expect(cache.peek("/api/catalog")).toEqual({ total: 3 });
  });

  it("a second load of the same URL does not fetch again", async () => {
    const { impl, calls } = fakeFetch({ total: 3 });
    const cache = createFetchCache(impl);

    const first = await cache.load("/api/catalog");
    const second = await cache.load("/api/catalog");

    expect(calls).toHaveLength(1);
    expect(second).toBe(first);
  });

  it("different URLs are cached separately", async () => {
    const { impl, calls } = fakeFetch({ ok: true });
    const cache = createFetchCache(impl);

    await cache.load("/api/catalog?category=Sensors");
    await cache.load("/api/catalog?category=Motors");

    expect(calls).toEqual(["/api/catalog?category=Sensors", "/api/catalog?category=Motors"]);
  });

  it("two concurrent loads of one URL share a single fetch", async () => {
    const { impl, calls, release } = deferredFetch({ total: 3 });
    const cache = createFetchCache(impl);

    const a = cache.load("/api/tutorials");
    const b = cache.load("/api/tutorials");
    release();

    expect(await a).toEqual({ total: 3 });
    expect(await b).toEqual({ total: 3 });
    expect(calls).toHaveLength(1);
  });

  it("a rejected fetch leaves nothing cached, so the next load retries", async () => {
    let attempts = 0;
    const impl = (async () => {
      attempts += 1;
      if (attempts === 1) throw new TypeError("Failed to fetch");
      return new Response(JSON.stringify({ total: 3 }), { status: 200 });
    }) as FetchImpl;
    const cache = createFetchCache(impl);

    await expect(cache.load("/api/catalog")).rejects.toThrow("Failed to fetch");
    expect(cache.peek("/api/catalog")).toBeUndefined();

    expect(await cache.load("/api/catalog")).toEqual({ total: 3 });
    expect(attempts).toBe(2);
  });

  it("a non-2xx response rejects with the status and is not cached", async () => {
    const { impl, calls } = fakeFetch({ error: "down" }, 503);
    const cache = createFetchCache(impl);

    await expect(cache.load("/api/catalog")).rejects.toThrow("503");
    expect(cache.peek("/api/catalog")).toBeUndefined();

    await expect(cache.load("/api/catalog")).rejects.toThrow("503");
    expect(calls).toHaveLength(2);
  });

});
