import { describe, expect, it } from "vitest";
import { countAt, easeOutCubic } from "./countUp";

describe("easeOutCubic", () => {
  it("starts at 0 and ends at 1", () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
  });
  it("is past halfway at t = 0.5, so the count starts fast and settles", () => {
    expect(easeOutCubic(0.5)).toBeCloseTo(0.875);
  });
});

describe("countAt", () => {
  const delay = 120;
  const duration = 1200;

  it("shows the starting value until the delay has passed", () => {
    expect(countAt(0, 2880, 0, delay, duration)).toBe(0);
    expect(countAt(0, 2880, 119, delay, duration)).toBe(0);
  });
  it("shows the target once the count is over", () => {
    expect(countAt(0, 2880, delay + duration, delay, duration)).toBe(2880);
    expect(countAt(0, 2880, 10_000, delay, duration)).toBe(2880);
  });
  it("is an eased fraction of the way in between", () => {
    // Halfway through the duration, eased: 0.875 of 2880 = 2520.
    expect(countAt(0, 2880, delay + duration / 2, delay, duration)).toBe(2520);
  });
  it("counts from a non-zero start, up or down", () => {
    expect(countAt(2880, 2900, delay + duration, delay, duration)).toBe(2900);
    expect(countAt(2900, 2880, delay + duration, delay, duration)).toBe(2880);
    expect(countAt(100, 200, delay + duration / 2, delay, duration)).toBe(188);
  });
  it("returns whole numbers", () => {
    for (let ms = 0; ms <= delay + duration; ms += 37) {
      expect(Number.isInteger(countAt(0, 13, ms, delay, duration))).toBe(true);
    }
  });
});
