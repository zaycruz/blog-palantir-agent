import { openai } from "@ai-sdk/openai";
import { generateText, tool, stepCountIs } from "ai";
import { ContentAgent } from "./agent.js";
import { ContentType } from "./models.js";
import { z } from "zod";

const SYSTEM_PROMPT = `You are a research and content creation specialist for Raava. Your mission is to create compelling LinkedIn content that establishes Raava as a thought leader and generates awareness among SMB leaders.

## About Raava
Raava is a technical consulting and product company that helps small and mid-sized businesses solve real business problems. We design and build efficient, integrated systems that people actually use. We're tool-agnostic and outcome-driven—combining platforms, custom software, and AI rather than forcing problems into a single tool. Palantir Foundry expertise is a key differentiator, but not a constraint.

## Your Core Workflow

### 1. Interview First (ALWAYS)
Before writing ANY content, conduct a mini-interview to capture the user's authentic voice:
- Ask 1-2 questions at a time (never a full questionnaire)
- Dig for specific examples, stories, and unique perspectives
- Understand who the content is for and what they should take away
- Calibrate tone and technical depth

### 2. Research Thoroughly
Use web search and URL fetching to:
- Verify facts and find supporting data
- Understand current context and recent developments
- Find unique angles and avoid generic takes
- Primary sources: Palantir docs, then Reddit, articles, Twitter

### 3. Write with Purpose
- LinkedIn posts are the priority (150-300 words, strong hooks)
- First 2 lines MUST grab attention (before "see more")
- Expert but approachable tone—no corporate speak
- Provide value without selling—let expertise speak for itself
- End with soft engagement prompts, not CTAs

## Guidelines

- Always start with questions to understand what the user wants to write about
- Never write without interviewing first
- Be conversational and peer-to-peer, not formal or robotic
- When the user shares a topic, dig deeper before drafting
- Conduct research autonomously when needed
- Track draft IDs from context (user might say "approve this" referring to last draft)
- Keep responses concise but substantive

## Voice
- Pragmatic over trendy
- Honest about tradeoffs
- Curious and always learning
- Deep expertise without jargon walls`;

export class LLMClient {
  private model = openai("gpt-5.2");

  constructor(private agent: ContentAgent) {}

  tools = {
    createDraft: tool({
      description: "Create a new content draft",
      inputSchema: z.object({
        title: z.string().describe("Title of the content"),
        body: z.string().describe("Main content/body of the draft"),
        contentType: z.enum(["linkedin_post", "linkedin_article", "blog_post"]).describe("Type of content")
      }),
      execute: async ({ title, body, contentType }) => {
        const draft = await this.agent.createDraft({ title, body, contentType });
        return JSON.stringify(draft);
      }
    }),

    listDrafts: tool({
      description: "List all existing drafts",
      inputSchema: z.object({}),
      execute: async () => {
        const drafts = await this.agent.listDrafts();
        return JSON.stringify(drafts);
      }
    }),

    approveDraft: tool({
      description: "Approve a draft for publishing",
      inputSchema: z.object({
        id: z.string().describe("Draft ID (UUID)"),
        feedback: z.string().optional().describe("Optional feedback on why it was approved")
      }),
      execute: async ({ id, feedback }) => {
        const draft = await this.agent.updateDraftStatus(id, "approved", feedback);
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
        const draft = await this.agent.updateDraftStatus(id, "rejected", feedback);
        return JSON.stringify(draft);
      }
    }),

    addInterview: tool({
      description: "Add an interview entry (Q&A pair for voice capture)",
      inputSchema: z.object({
        question: z.string().describe("Interview question"),
        answer: z.string().describe("Interview answer")
      }),
      execute: async ({ question, answer }) => {
        const entry = await this.agent.addInterview(question, answer);
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
        const entry = await this.agent.addTopic(topic, notes);
        return JSON.stringify(entry);
      }
    }),

    snapshot: tool({
      description: "Show all stored data",
      inputSchema: z.object({}),
      execute: async () => {
        const data = await this.agent.snapshot();
        return JSON.stringify(data, null, 2);
      }
    }),

    getDraft: tool({
      description: "Get a specific draft by ID",
      inputSchema: z.object({
        id: z.string().describe("Draft ID (UUID)")
      }),
      execute: async ({ id }) => {
        const draft = await this.agent.getDraft(id);
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
        const draft = await this.agent.updateDraft(id, { title, body });
        return JSON.stringify(draft);
      }
    }),

    deleteDraft: tool({
      description: "Delete a draft",
      inputSchema: z.object({
        id: z.string().describe("Draft ID (UUID)")
      }),
      execute: async ({ id }) => {
        await this.agent.deleteDraft(id);
        return "Draft deleted successfully";
      }
    }),

    webSearch: tool({
      description: "Search the web for information. Use for research on topics, finding recent news, verifying facts, or discovering content ideas.",
      inputSchema: z.object({
        query: z.string().describe("Search query"),
        numResults: z.number().optional().describe("Number of results to return (default 5)")
      }),
      execute: async ({ query, numResults = 5 }) => {
        const results = await this.agent.webSearch(query, numResults);
        return JSON.stringify(results, null, 2);
      }
    }),

    fetchUrl: tool({
      description: "Fetch and extract content from a specific URL. Use to read articles, documentation, or any web page.",
      inputSchema: z.object({
        url: z.string().describe("URL to fetch content from")
      }),
      execute: async ({ url }) => {
        const content = await this.agent.fetchUrl(url);
        return content;
      }
    })
  };

  async chat(message: string, history?: Array<{ role: "user" | "assistant"; content: string }>): Promise<string> {
    if (!process.env.OPENAI_API_KEY) {
      return "OpenAI API key not configured. Please add OPENAI_API_KEY to .env file.";
    }

    try {
      // Build messages array from history (excluding the current message which is already in history)
      const previousMessages = history 
        ? history.slice(0, -1).map(msg => ({ 
            role: msg.role as "user" | "assistant", 
            content: msg.content 
          }))
        : [];

      const { text } = await generateText({
        model: this.model,
        system: SYSTEM_PROMPT,
        messages: [
          ...previousMessages,
          { role: "user" as const, content: message }
        ],
        tools: this.tools,
        stopWhen: stepCountIs(5)
      });

      return text;
    } catch (error) {
      if (error instanceof Error && error.message.includes("API key")) {
        return "OpenAI API key is invalid or missing. Please check OPENAI_API_KEY in .env.";
      }
      throw error;
    }
  }
}
