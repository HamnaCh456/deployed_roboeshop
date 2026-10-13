import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createFileCache,
  parseSerpResults,
  searchVideos,
  TTL_MS,
  type Video,
  type VideoCache,
} from "./findVideoTutorials";

const serpBody = {
  video_results: [
    { title: "HC-SR04 with Arduino", link: "https://youtube.com/watch?v=1", channel: { name: "Maker A" }, length: "5:12" },
    { title: "Ultrasonic basics", link: "https://youtube.com/watch?v=2", channel: { name: "Maker B" }, length: "12:01" },
    { title: "3", link: "https://youtube.com/watch?v=3", channel: { name: "C" }, length: "1:00" },
    { title: "4", link: "https://youtube.com/watch?v=4", channel: { name: "D" }, length: "1:00" },
    { title: "5", link: "https://youtube.com/watch?v=5", channel: { name: "E" }, length: "1:00" },
    { title: "6", link: "https://youtube.com/watch?v=6", channel: { name: "F" }, length: "1:00" },
  ],
};

describe("parseSerpResults", () => {
  it("keeps five results with the four fields the model needs", () => {
    const videos = parseSerpResults(serpBody);
    expect(videos).toHaveLength(5);
    expect(videos[0]).toEqual({ title: "HC-SR04 with Arduino", channel: "Maker A", url: "https://youtube.com/watch?v=1", duration: "5:12" });
  });

  it("tolerates missing channel or length", () => {
    const videos = parseSerpResults({ video_results: [{ title: "x", link: "https://y" }] });
    expect(videos).toEqual([{ title: "x", channel: "", url: "https://y", duration: "" }]);
  });

  it("returns an empty list for a body with no video_results", () => {
    expect(parseSerpResults({})).toEqual([]);
  });
});

describe("createFileCache", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "yt-cache-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("misses on an unknown key and hits after set, persisting to disk", () => {
    const file = join(dir, "youtube.json");
    let now = 1_000;
    const cache = createFileCache(file, () => now);
    expect(cache.get("hc-sr04")).toBeUndefined();
    cache.set("hc-sr04", [{ title: "t", channel: "c", url: "u", duration: "d" }]);
    expect(cache.get("hc-sr04")).toHaveLength(1);
    expect(JSON.parse(readFileSync(file, "utf8"))["hc-sr04"].at).toBe(1_000);

    // A fresh instance reads what the first one wrote.
    const reopened = createFileCache(file, () => now);
    expect(reopened.get("hc-sr04")).toHaveLength(1);

    now = 1_000 + TTL_MS + 1;
    expect(reopened.get("hc-sr04")).toBeUndefined();
  });

  it("survives a missing or corrupt file", () => {
    const file = join(dir, "missing", "youtube.json");
    const cache = createFileCache(file, () => 0);
    expect(cache.get("x")).toBeUndefined();
    cache.set("x", []);
    expect(cache.get("x")).toEqual([]);
  });
});

describe("searchVideos", () => {
  it("calls SerpAPI once per query and serves the second call from cache", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string) => {
      calls.push(url);
      return new Response(JSON.stringify(serpBody));
    }) as unknown as typeof fetch;
    const store = new Map<string, Video[]>();
    const cache: VideoCache = {
      get: (k) => store.get(k),
      set: (k, v) => void store.set(k, v),
    };

    const first = await searchVideos("HC-SR04 Arduino", { fetch: fetchImpl, key: "k", cache });
    const second = await searchVideos("  hc-sr04 arduino ", { fetch: fetchImpl, key: "k", cache });
    expect(first).toHaveLength(5);
    expect(second).toEqual(first);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toBe("https://serpapi.com/search.json?engine=youtube&search_query=hc-sr04+arduino&api_key=k");
  });

  it("returns an error object, not an exception, when SerpAPI fails", async () => {
    const fetchImpl = (async () => new Response("nope", { status: 500 })) as unknown as typeof fetch;
    const cache: VideoCache = { get: () => undefined, set: () => undefined };
    const result = await searchVideos("x", { fetch: fetchImpl, key: "k", cache });
    expect(result).toEqual({ error: "Video search is unavailable right now." });
  });
});
