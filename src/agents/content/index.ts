// Content Agent - handles content creation, drafts, research

import Database from 'better-sqlite3';
import { z } from 'zod';
import { tool } from 'ai';
import { LLMClient } from '../../shared/llm.js';
import { DraftStorage } from '../../db/drafts.js';
import { ResearchStorage } from '../../db/research.js';
import { AgentResponse, ExtractedEntity, EntityRef, SearchResult } from '../../shared/types.js';
import { CONTENT_AGENT_SYSTEM_PROMPT, CRITIC_SYSTEM_PROMPT } from './prompts.js';
import { Draft, ContentType, InterviewEntry, TopicQueueItem } from './types.js';

export class ContentAgent {
  private draftStorage: DraftStorage;
  private researchStorage: ResearchStorage;
  private llm: LLMClient;

  constructor(db: Database.Database, llm: LLMClient) {
    this.draftStorage = new DraftStorage(db);
    this.researchStorage = new ResearchStorage(db);
    this.llm = llm;
  }

  // Main handler for content-related messages
  async handle(
    message: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
    entities: ExtractedEntity[]
  ): Promise<AgentResponse> {
    const tools = this.getTools();

    const response = await this.llm.chat(
      message,
      history.map(h => ({ role: h.role, content: h.content })),
      {
        systemPrompt: CONTENT_AGENT_SYSTEM_PROMPT,
        tools,
        maxSteps: 10
      }
    );

    // Extract any entities mentioned in the response
    const responseEntities: EntityRef[] = [];

    // Check if a draft was created/mentioned and add as entity
    const drafts = await this.listDrafts();
    if (drafts.length > 0) {
      const latestDraft = drafts[0];
      if (response.toLowerCase().includes(latestDraft.title.toLowerCase())) {
        responseEntities.push({
          type: 'contact', // Using 'contact' as a general entity type
          id: latestDraft.id,
          name: latestDraft.title,
          mentionedAt: new Date().toISOString()
        });
      }
    }

    return {
      message: response,
      entities: responseEntities
    };
  }

  // Get tools for this agent
  private getTools() {
    return {
      createDraft: tool({
        description: "Create a new content draft",
        inputSchema: z.object({
          title: z.string().describe("Title of the content"),
          body: z.string().describe("Main content/body of the draft"),
          contentType: z.enum(["linkedin_post", "linkedin_article", "blog_post"]).describe("Type of content")
        }),
        execute: async ({ title, body, contentType }) => {
          const draft = await this.createDraft({ title, body, contentType });
          return JSON.stringify(draft);
        }
      }),

      listDrafts: tool({
        description: "List all existing drafts",
        inputSchema: z.object({}),
        execute: async () => {
          const drafts = await this.listDrafts();
          return JSON.stringify(drafts);
        }
      }),

      getDraft: tool({
        description: "Get a specific draft by ID",
        inputSchema: z.object({
          id: z.string().describe("Draft ID (UUID)")
        }),
        execute: async ({ id }) => {
          const draft = await this.getDraft(id);
          return draft ? JSON.stringify(draft) : "Draft not found";
        }
      }),

      updateDraft: tool({
        description: "Update an existing draft's title or body",
        inputSchema: z.object({
          id: z.string().describe("Draft ID (UUID)"),
          title: z.string().optional().describe("New title (optional)"),
          body: z.string().optional().describe("New body content (optional)")
        }),
        execute: async ({ id, title, body }) => {
          const draft = await this.updateDraft(id, { title, body });
          return JSON.stringify(draft);
        }
      }),

      approveDraft: tool({
        description: "Approve a draft for publishing",
        inputSchema: z.object({
          id: z.string().describe("Draft ID (UUID)"),
          feedback: z.string().optional().describe("Optional feedback on why it was approved")
        }),
        execute: async ({ id, feedback }) => {
          const draft = await this.updateDraftStatus(id, "approved", feedback);
          return JSON.stringify(draft);
        }
      }),

      rejectDraft: tool({
        description: "Reject a draft",
        inputSchema: z.object({
          id: z.string().describe("Draft ID (UUID)"),
          feedback: z.string().describe("Reason for rejection")
        }),
        execute: async ({ id, feedback }) => {
          const draft = await this.updateDraftStatus(id, "rejected", feedback);
          return JSON.stringify(draft);
        }
      }),

      deleteDraft: tool({
        description: "Delete a draft",
        inputSchema: z.object({
          id: z.string().describe("Draft ID (UUID)")
        }),
        execute: async ({ id }) => {
          await this.deleteDraft(id);
          return "Draft deleted successfully";
        }
      }),

      addInterview: tool({
        description: "Add an interview entry (Q&A pair for voice capture)",
        inputSchema: z.object({
          question: z.string().describe("Interview question"),
          answer: z.string().describe("Interview answer")
        }),
        execute: async ({ question, answer }) => {
          const entry = await this.addInterview(question, answer);
          return JSON.stringify(entry);
        }
      }),

      addTopic: tool({
        description: "Add a topic to the content queue",
        inputSchema: z.object({
          topic: z.string().describe("Topic name"),
          notes: z.string().optional().describe("Optional notes about the topic")
        }),
        execute: async ({ topic, notes }) => {
          const entry = await this.addTopic(topic, notes);
          return JSON.stringify(entry);
        }
      }),

      listTopics: tool({
        description: "List all topics in the queue",
        inputSchema: z.object({}),
        execute: async () => {
          const topics = await this.listTopics();
          return JSON.stringify(topics);
        }
      }),

      webSearch: tool({
        description: "Search the web for information. Use for research on topics, finding recent news, verifying facts, or discovering content ideas.",
        inputSchema: z.object({
          query: z.string().describe("Search query"),
          numResults: z.number().optional().describe("Number of results to return (default 5)")
        }),
        execute: async ({ query, numResults = 5 }) => {
          const results = await this.webSearch(query, numResults);
          return JSON.stringify(results, null, 2);
        }
      }),

      fetchUrl: tool({
        description: "Fetch and extract content from a specific URL. Use to read articles, documentation, or any web page.",
        inputSchema: z.object({
          url: z.string().describe("URL to fetch content from")
        }),
        execute: async ({ url }) => {
          const content = await this.fetchUrl(url);
          return content;
        }
      }),

      criticizeDraft: tool({
        description: "Get critic feedback on a draft before human review",
        inputSchema: z.object({
          id: z.string().describe("Draft ID to critique")
        }),
        execute: async ({ id }) => {
          const feedback = await this.criticizeDraft(id);
          return feedback;
        }
      })
    };
  }

  // Draft operations
  async createDraft(input: { title: string; body: string; contentType: ContentType }): Promise<Draft> {
    return this.draftStorage.create(input);
  }

  async listDrafts(): Promise<Draft[]> {
    return this.draftStorage.list();
  }

  async getDraft(id: string): Promise<Draft | null> {
    return this.draftStorage.get(id);
  }

  async updateDraft(id: string, updates: { title?: string; body?: string }): Promise<Draft> {
    return this.draftStorage.update(id, updates);
  }

  async updateDraftStatus(id: string, status: 'approved' | 'rejected', feedback?: string): Promise<Draft> {
    return this.draftStorage.updateStatus(id, status, feedback);
  }

  async deleteDraft(id: string): Promise<void> {
    return this.draftStorage.delete(id);
  }

  // Interview operations
  async addInterview(question: string, answer: string): Promise<InterviewEntry> {
    return this.researchStorage.createInterview(question, answer);
  }

  async listInterviews(limit?: number): Promise<InterviewEntry[]> {
    return this.researchStorage.listInterviews(limit);
  }

  // Topic operations
  async addTopic(topic: string, notes?: string): Promise<TopicQueueItem> {
    return this.researchStorage.createTopic(topic, notes);
  }

  async listTopics(limit?: number): Promise<TopicQueueItem[]> {
    return this.researchStorage.listTopics(limit);
  }

  // Research operations
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

  // Critic pass on a draft
  async criticizeDraft(id: string): Promise<string> {
    const draft = await this.getDraft(id);
    if (!draft) {
      return "Draft not found";
    }

    const message = `Please critique this ${draft.contentType}:

Title: ${draft.title}

Content:
${draft.body}`;

    const feedback = await this.llm.chat(message, [], {
      systemPrompt: CRITIC_SYSTEM_PROMPT
    });

    return feedback;
  }
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
