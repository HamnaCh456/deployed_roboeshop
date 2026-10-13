import { describe, expect, it } from "vitest";
import { systemPrompt } from "./prompt";

describe("systemPrompt", () => {
  it("is byte-stable across calls so provider prefix caching can apply", () => {
    expect(systemPrompt(true)).toBe(systemPrompt(true));
  });

  it("carries the grounding rule and the ROS honesty line", () => {
    const text = systemPrompt(true);
    expect(text).toContain("Only name products that search_catalog returned");
    expect(text).toContain("limited set of stores");
  });

  it("includes the topic rule only when guardrails are on", () => {
    expect(systemPrompt(true)).toContain("Stay on robotics");
    expect(systemPrompt(false)).not.toContain("Stay on robotics");
  });

  it("stays small — under ~600 tokens", () => {
    expect(systemPrompt(true).length).toBeLessThan(2600);
  });
});
