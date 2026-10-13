import { describe, expect, it } from "vitest";

import { AFTER_SIGN_IN, afterEmailLink, safeNext } from "./nextPath";

describe("safeNext", () => {
  it("keeps a same-site path", () => {
    expect(safeNext("/community")).toBe("/community");
  });

  it("refuses another site", () => {
    expect(safeNext("https://elsewhere.example")).toBe("/");
    expect(safeNext("//elsewhere.example")).toBe("/");
  });
});

describe("afterEmailLink", () => {
  it("sends a confirmed account to the dashboard", () => {
    expect(afterEmailLink(null)).toBe(AFTER_SIGN_IN);
    expect(afterEmailLink("/")).toBe(AFTER_SIGN_IN);
    expect(afterEmailLink("/community")).toBe(AFTER_SIGN_IN);
  });

  it("keeps password recovery on its auth page", () => {
    expect(afterEmailLink("/auth/update-password")).toBe("/auth/update-password");
  });

  it("never follows a link off the site", () => {
    expect(afterEmailLink("//elsewhere.example")).toBe(AFTER_SIGN_IN);
  });
});
