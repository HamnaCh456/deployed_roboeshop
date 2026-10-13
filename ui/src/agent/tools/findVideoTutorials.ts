/**
 * `find_video_tutorials` — YouTube results for "how do I use X".
 *
 * Proposal objective 7 names video tutorials as the gap no Pakistani robotics
 * store fills. This tool does not host or curate anything: it runs a YouTube
 * search through SerpAPI and hands the model five titles with links. The
 * model presents them; the user watches them on YouTube.
 *
 * Results are cached on disk because SerpAPI bills per search, not because of
 * tokens (five results are ~250 tokens). YouTube Data API v3 returns the same
 * fields free within its quota; only the fetch in searchVideos() would change.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { tool } from "ai";
import { z } from "zod";

export interface Video {
  title: string;
  channel: string;
  url: string;
  duration: string;
}

export interface VideoCache {
  get(key: string): Video[] | undefined;
  set(key: string, videos: Video[]): void;
}

export const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const RESULT_LIMIT = 5;

// -------------------------------------------------------------------- cache

type CacheFile = Record<string, { at: number; videos: Video[] }>;

/** Loaded once, written through on every set. A bad file is an empty cache. */
export function createFileCache(path: string, now: () => number = Date.now): VideoCache {
  let entries: CacheFile;
  try {
    entries = JSON.parse(readFileSync(path, "utf8")) as CacheFile;
  } catch {
    entries = {};
  }
  return {
    get(key) {
      const hit = entries[key];
      if (!hit) return undefined;
      if (now() - hit.at > TTL_MS) {
        delete entries[key];
        return undefined;
      }
      return hit.videos;
    },
    set(key, videos) {
      entries[key] = { at: now(), videos };
      try {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, JSON.stringify(entries));
      } catch (err) {
        console.warn(`[find_video_tutorials] cache not written: ${String(err)}`);
      }
    },
  };
}

// ------------------------------------------------------------------ SerpAPI

interface SerpVideo {
  title?: string;
  link?: string;
  channel?: { name?: string };
  length?: string;
}

export function parseSerpResults(body: { video_results?: SerpVideo[] }): Video[] {
  return (body.video_results ?? []).slice(0, RESULT_LIMIT).map((v) => ({
    title: v.title ?? "",
    channel: v.channel?.name ?? "",
    url: v.link ?? "",
    duration: v.length ?? "",
  }));
}

export interface VideoDeps {
  fetch: typeof fetch;
  key: string;
  cache: VideoCache;
}

export interface VideoError {
  error: string;
}

export async function searchVideos(query: string, deps: VideoDeps): Promise<Video[] | VideoError> {
  const key = query.trim().toLowerCase().replace(/\s+/g, " ");
  const cached = deps.cache.get(key);
  if (cached) {
    console.log(`[find_video_tutorials] cache hit "${key}"`);
    return cached;
  }

  const params = new URLSearchParams({ engine: "youtube", search_query: key, api_key: deps.key });
  try {
    const res = await deps.fetch(`https://serpapi.com/search.json?${params.toString()}`);
    if (!res.ok) throw new Error(`SerpAPI ${res.status}`);
    const videos = parseSerpResults((await res.json()) as { video_results?: SerpVideo[] });
    deps.cache.set(key, videos);
    return videos;
  } catch (err) {
    console.warn(`[find_video_tutorials] ${String(err)}`);
    return { error: "Video search is unavailable right now." };
  }
}

// --------------------------------------------------------------------- tool

export function makeFindVideoTutorialsTool(deps: VideoDeps) {
  return tool({
    description:
      "Find up to five YouTube video tutorials for a part, board or technique. Call it only when the user asks how to use, wire, program or learn something. Present the results as markdown links with the channel name.",
    inputSchema: z.object({
      query: z
        .string()
        .describe('A short YouTube search, naming the part and the board, e.g. "HC-SR04 Arduino" or "L298N motor driver ESP32".'),
    }),
    execute: async ({ query }) => searchVideos(query, deps),
  });
}
