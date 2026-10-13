import { beforeEach, describe, expect, it } from "vitest";
import { forget, history, remember } from "./memory";

describe("memory", () => {
  beforeEach(() => forget("u1"));

  it("starts empty", () => {
    expect(history("u1")).toEqual([]);
  });

  it("stores one user and one assistant message per exchange, as plain text", () => {
    remember("u1", "hi", "hello");
    expect(history("u1")).toEqual([
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ]);
  });

  it("keeps only the last 12 messages, dropping the oldest first", () => {
    for (let i = 1; i <= 7; i += 1) remember("u1", `q${i}`, `a${i}`);
    const kept = history("u1");
    expect(kept).toHaveLength(12);
    expect(kept[0]).toEqual({ role: "user", content: "q2" });
    expect(kept[11]).toEqual({ role: "assistant", content: "a7" });
  });

  it("isolates users", () => {
    remember("u1", "a", "b");
    expect(history("u2")).toEqual([]);
  });

  it("returns a copy, so callers cannot mutate the store", () => {
    remember("u1", "a", "b");
    history("u1").push({ role: "user", content: "injected" });
    expect(history("u1")).toHaveLength(2);
  });
});
