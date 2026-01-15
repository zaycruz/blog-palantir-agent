import { openai } from "@ai-sdk/openai";
import { generateText, tool, stepCountIs } from "ai";
import { ContentAgent } from "./agent.js";
import { ContentType } from "./models.js";
import { z } from "zod";

const SYSTEM_PROMPT = `You are a helpful content agent that manages blog posts, LinkedIn content, and approvals for a Palantir Foundry expert.

Your role:
- Help user create, review, and manage content drafts
- Maintain a conversational, peer-to-peer tone (not robotic or overly formal)
- Be proactive and helpful - ask clarifying questions when needed
- Use tools to interact with the content storage system

Available capabilities:
- Create drafts (blog posts, LinkedIn posts, LinkedIn articles)
- List and review existing drafts
- Approve or reject drafts with feedback
- Add interview entries (Q&A pairs for voice capture)
- Add topics to queue for future content
- Show snapshot of all stored data

Guidelines:
- Respond naturally and conversationally
- Extract draft IDs from context (user might just say "approve this one" when referring to last draft shown)
- When creating drafts, if title or body is missing, ask for it
- When approving/rejecting, if user doesn't specify ID, use the most recently mentioned or created draft
- Keep responses concise but friendly
- Adapt tone based on conversation context`;

export class LLMClient {
  private model = openai("gpt-4o");

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
    })
  };

  async chat(message: string, context?: string): Promise<string> {
    if (!process.env.OPENAI_API_KEY) {
      return "OpenAI API key not configured. Please add OPENAI_API_KEY to .env file.";
    }

    try {
      const { text } = await generateText({
        model: this.model,
        system: SYSTEM_PROMPT,
        messages: [
          ...(context ? [{ role: "system" as const, content: context }] : []),
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
