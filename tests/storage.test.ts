import { describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import { promises as fs } from "node:fs";
import { JsonStorage } from "../src/storage.js";

const tempPath = (name: string) => path.join(os.tmpdir(), name);

describe("JsonStorage", () => {
  it("creates and reads a new store", async () => {
    const storage = new JsonStorage({ dataFilePath: tempPath(`store-${Date.now()}.json`) });
    await storage.ensure();

    const data = await storage.read();

    expect(data.drafts).toEqual([]);
    expect(data.interviews).toEqual([]);
    expect(data.topics).toEqual([]);
  });

  it("recovers from an empty store file", async () => {
    const filePath = tempPath(`store-${Date.now()}.json`);
    await fs.writeFile(filePath, "");

    const storage = new JsonStorage({ dataFilePath: filePath });
    const data = await storage.read();

    expect(data.drafts).toEqual([]);
    expect(data.interviews).toEqual([]);
    expect(data.topics).toEqual([]);
  });

  it("recovers from malformed JSON", async () => {
    const filePath = tempPath(`store-${Date.now()}.json`);
    await fs.writeFile(filePath, "{not-json}");

    const storage = new JsonStorage({ dataFilePath: filePath });
    const data = await storage.read();

    expect(data.drafts).toEqual([]);
    expect(data.interviews).toEqual([]);
    expect(data.topics).toEqual([]);

    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as { drafts: unknown[] };
    expect(parsed.drafts).toEqual([]);
  });
});
