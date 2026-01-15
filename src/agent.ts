import { randomUUID } from "node:crypto";
import { Draft, InterviewEntry, StoreData, TopicQueueItem, ContentType } from "./models.js";
import { JsonStorage } from "./storage.js";

export interface CreateDraftInput {
  title: string;
  body: string;
  contentType: ContentType;
}

export class ContentAgent {
  constructor(private storage: JsonStorage) {}

  async init(): Promise<void> {
    await this.storage.ensure();
  }

  async listDrafts(): Promise<Draft[]> {
    const data = await this.storage.read();
    return data.drafts;
  }

  async createDraft(input: CreateDraftInput): Promise<Draft> {
    const data = await this.storage.read();
    const now = new Date().toISOString();
    const draft: Draft = {
      id: randomUUID(),
      title: input.title,
      body: input.body,
      contentType: input.contentType,
      createdAt: now,
      updatedAt: now,
      status: "pending"
    };
    data.drafts.push(draft);
    await this.storage.write(data);
    return draft;
  }

  async updateDraftStatus(id: string, status: "approved" | "rejected", feedback?: string): Promise<Draft> {
    const data = await this.storage.read();
    const draft = data.drafts.find((item) => item.id === id);
    if (!draft) {
      throw new Error(`Draft not found: ${id}`);
    }
    draft.status = status;
    draft.feedback = feedback;
    draft.updatedAt = new Date().toISOString();
    await this.storage.write(data);
    return draft;
  }

  async addInterview(question: string, answer: string): Promise<InterviewEntry> {
    const data = await this.storage.read();
    const entry: InterviewEntry = {
      id: randomUUID(),
      question,
      answer,
      createdAt: new Date().toISOString()
    };
    data.interviews.push(entry);
    await this.storage.write(data);
    return entry;
  }

  async addTopic(topic: string, notes?: string): Promise<TopicQueueItem> {
    const data = await this.storage.read();
    const entry: TopicQueueItem = {
      id: randomUUID(),
      topic,
      notes,
      createdAt: new Date().toISOString()
    };
    data.topics.push(entry);
    await this.storage.write(data);
    return entry;
  }

  async snapshot(): Promise<StoreData> {
    return this.storage.read();
  }

  async getDraft(id: string): Promise<Draft | undefined> {
    const data = await this.storage.read();
    return data.drafts.find((item) => item.id === id);
  }

  async updateDraft(id: string, updates: { title?: string; body?: string }): Promise<Draft> {
    const data = await this.storage.read();
    const draft = data.drafts.find((item) => item.id === id);
    if (!draft) {
      throw new Error(`Draft not found: ${id}`);
    }
    if (updates.title) {
      draft.title = updates.title;
    }
    if (updates.body) {
      draft.body = updates.body;
    }
    draft.updatedAt = new Date().toISOString();
    await this.storage.write(data);
    return draft;
  }

  async deleteDraft(id: string): Promise<void> {
    const data = await this.storage.read();
    const index = data.drafts.findIndex((item) => item.id === id);
    if (index === -1) {
      throw new Error(`Draft not found: ${id}`);
    }
    data.drafts.splice(index, 1);
    await this.storage.write(data);
  }

  async webSearch(query: string, numResults: number = 5): Promise<SearchResult[]> {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
      throw new Error("TAVILY_API_KEY not configured. Add it to .env file.");
    }

    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results: numResults,
        include_answer: true,
        include_raw_content: false
      })
    });

    if (!response.ok) {
      throw new Error(`Search failed: ${response.statusText}`);
    }

    const data = await response.json() as TavilyResponse;
    return data.results.map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.content,
      score: r.score
    }));
  }

  async fetchUrl(url: string): Promise<string> {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
      throw new Error("TAVILY_API_KEY not configured. Add it to .env file.");
    }

    const response = await fetch("https://api.tavily.com/extract", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        api_key: apiKey,
        urls: [url]
      })
    });

    if (!response.ok) {
      throw new Error(`Fetch failed: ${response.statusText}`);
    }

    const data = await response.json() as TavilyExtractResponse;
    if (data.results && data.results.length > 0) {
      return data.results[0].raw_content || "No content extracted";
    }
    return "No content extracted";
  }
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  score: number;
}

interface TavilyResponse {
  results: Array<{
    title: string;
    url: string;
    content: string;
    score: number;
  }>;
}

interface TavilyExtractResponse {
  results: Array<{
    url: string;
    raw_content: string;
  }>;
}
