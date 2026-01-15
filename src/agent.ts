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
}
