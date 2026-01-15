import { promises as fs } from "node:fs";
import path from "node:path";
import { StoreData } from "./models.js";

const createDefaultData = (): StoreData => ({
  drafts: [],
  interviews: [],
  topics: []
});

export interface StorageOptions {
  dataFilePath?: string;
}

export class JsonStorage {
  private dataFilePath: string;

  constructor(options: StorageOptions = {}) {
    this.dataFilePath = options.dataFilePath ?? path.resolve("data", "store.json");
  }

  get path(): string {
    return this.dataFilePath;
  }

  async ensure(): Promise<void> {
    await fs.mkdir(path.dirname(this.dataFilePath), { recursive: true });
    try {
      const stats = await fs.stat(this.dataFilePath);
      if (stats.size === 0) {
        await this.write(createDefaultData());
      }
    } catch {
      await this.write(createDefaultData());
    }
  }

  async read(): Promise<StoreData> {
    await this.ensure();
    const raw = await fs.readFile(this.dataFilePath, "utf8");
    try {
      return JSON.parse(raw) as StoreData;
    } catch {
      const fallback = createDefaultData();
      await this.write(fallback);
      return fallback;
    }
  }

  async write(data: StoreData): Promise<void> {
    await fs.mkdir(path.dirname(this.dataFilePath), { recursive: true });
    await fs.writeFile(this.dataFilePath, JSON.stringify(data, null, 2));
  }
}
