import { describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import { ContentAgent } from "../src/agent.js";
import { JsonStorage } from "../src/storage.js";

const tempPath = (name: string) => path.join(os.tmpdir(), name);

describe("ContentAgent", () => {
  it("creates and approves a draft", async () => {
    const storage = new JsonStorage({ dataFilePath: tempPath(`store-${Date.now()}.json`) });
    const agent = new ContentAgent(storage);

    const draft = await agent.createDraft({
      title: "Foundry tip",
      body: "Start with a small ontology.",
      contentType: "linkedin_post"
    });

    expect(draft.status).toBe("pending");

    const approved = await agent.updateDraftStatus(draft.id, "approved", "Looks good");

    expect(approved.status).toBe("approved");
    expect(approved.feedback).toBe("Looks good");
  });

  it("stores interview responses", async () => {
    const storage = new JsonStorage({ dataFilePath: tempPath(`store-${Date.now()}.json`) });
    const agent = new ContentAgent(storage);

    const entry = await agent.addInterview("What do you like?", "Ontology workflows.");

    expect(entry.question).toBe("What do you like?");
  });

  it("throws when draft id is missing", async () => {
    const storage = new JsonStorage({ dataFilePath: tempPath(`store-${Date.now()}.json`) });
    const agent = new ContentAgent(storage);

    await expect(agent.updateDraftStatus("missing", "approved")).rejects.toThrow("Draft not found");
  });

  it("stores topic queue items", async () => {
    const storage = new JsonStorage({ dataFilePath: tempPath(`store-${Date.now()}.json`) });
    const agent = new ContentAgent(storage);

    const entry = await agent.addTopic("Foundry AIP", "Focus on governance.");

    expect(entry.topic).toBe("Foundry AIP");
  });
});
