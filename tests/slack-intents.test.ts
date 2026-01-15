import { describe, expect, it } from "vitest";
import { parseSlackInput } from "../src/slack-intents.js";

describe("parseSlackInput", () => {
  it("parses a draft request", () => {
    const intent = parseSlackInput('Create draft title "Hello" body "World" linkedin post');
    if (intent.type !== "draft") {
      throw new Error("Expected draft intent");
    }
    expect(intent.title).toBe("Hello");
    expect(intent.body).toBe("World");
    expect(intent.contentType).toBe("linkedin_post");
  });

  it("parses approval with id", () => {
    const intent = parseSlackInput("Approve 123e4567-e89b-12d3-a456-426614174000");
    expect(intent.type).toBe("approve");
  });

  it("parses rejection with feedback", () => {
    const intent = parseSlackInput('Reject 123e4567-e89b-12d3-a456-426614174000 feedback "Too long"');
    if (intent.type !== "reject") {
      throw new Error("Expected reject intent");
    }
    expect(intent.feedback).toBe("Too long");
  });

  it("handles greeting", () => {
    const intent = parseSlackInput("hi");
    expect(intent.type).toBe("greeting");
  });

  it("handles unknown input", () => {
    const intent = parseSlackInput("Tell me more");
    expect(intent.type).toBe("unknown");
  });
});
