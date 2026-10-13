import { describe, expect, it } from "vitest";
import { parseProviderList, withFailover } from "./provider";

describe("parseProviderList", () => {
  it("keeps the configured order", () => {
    expect(parseProviderList("openai,gemini")).toEqual(["openai", "gemini"]);
  });

  it("defaults to gemini then openai when unset or empty", () => {
    expect(parseProviderList(undefined)).toEqual(["gemini", "openai"]);
    expect(parseProviderList("")).toEqual(["gemini", "openai"]);
  });

  it("ignores case, whitespace, duplicates and unknown names", () => {
    expect(parseProviderList(" OpenAI , gemini, openai, claude ")).toEqual(["openai", "gemini"]);
  });

  it("falls back to the default when nothing is recognised", () => {
    expect(parseProviderList("claude")).toEqual(["gemini", "openai"]);
  });
});

describe("withFailover", () => {
  it("returns the first provider that completes", async () => {
    const tried: string[] = [];
    const used = await withFailover(["gemini", "openai"], async (name) => {
      tried.push(name);
      return "completed";
    });
    expect(used).toBe("gemini");
    expect(tried).toEqual(["gemini"]);
  });

  it("moves to the next provider when one fails before producing output", async () => {
    const used = await withFailover(["gemini", "openai"], async (name) =>
      name === "gemini" ? "failed-before-output" : "completed"
    );
    expect(used).toBe("openai");
  });

  it("returns null when every provider fails", async () => {
    const used = await withFailover(["gemini", "openai"], async () => "failed-before-output");
    expect(used).toBeNull();
  });
});
