import { describe, expect, it } from "vitest";
import { parseArgs } from "../src/commands.js";

describe("parseArgs", () => {
  it("parses flags with values", () => {
    const parsed = parseArgs(["draft", "--title", "Hello", "--body", "World"]);

    expect(parsed.command).toBe("draft");
    expect(parsed.flags["--title"]).toBe("Hello");
    expect(parsed.flags["--body"]).toBe("World");
  });

  it("handles missing flag values", () => {
    const parsed = parseArgs(["draft", "--title", "Hello", "--body"]);

    expect(parsed.flags["--body"]).toBeUndefined();
  });
});
