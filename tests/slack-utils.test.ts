import { describe, expect, it } from "vitest";
import { isDirectMessage } from "../src/slack-utils.js";

describe("isDirectMessage", () => {
  it("detects im channel type", () => {
    expect(isDirectMessage("im", "C123")).toBe(true);
  });

  it("detects D-prefixed channel", () => {
    expect(isDirectMessage(undefined, "D123")).toBe(true);
  });

  it("returns false for non-D channels", () => {
    expect(isDirectMessage(undefined, "C123")).toBe(false);
  });
});
