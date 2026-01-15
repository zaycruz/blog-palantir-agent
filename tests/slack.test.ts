import { describe, expect, it } from "vitest";
import { formatDraftSummary } from "../src/slack.js";
import { Draft } from "../src/models.js";

describe("formatDraftSummary", () => {
  it("formats a draft summary", () => {
    const draft: Draft = {
      id: "123",
      title: "Foundry update",
      body: "This is a detailed body about Foundry updates.",
      contentType: "linkedin_post",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: "pending"
    };

    const summary = formatDraftSummary(draft);

    expect(summary).toContain("Foundry update");
    expect(summary).toContain("linkedin_post");
    expect(summary).toContain("Status: pending");
  });
});
