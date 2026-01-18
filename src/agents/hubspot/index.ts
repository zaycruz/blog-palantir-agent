// HubSpot Agent - handles CRM operations

import Database from 'better-sqlite3';
import { z } from 'zod';
import { tool } from 'ai';
import { LLMClient } from '../../shared/llm.js';
import { HubSpotApiClient } from './api.js';
import { AgentResponse, ExtractedEntity, EntityRef } from '../../shared/types.js';
import {
  CreateContactInput,
  CreateCompanyInput,
  CreateDealInput,
  CreateTaskInput,
  CreateNoteInput,
  HubSpotContact,
  HubSpotDeal
} from './types.js';

const HUBSPOT_AGENT_SYSTEM_PROMPT = `You are a HubSpot CRM assistant. You help users manage their contacts, companies, deals, tasks, and notes through natural conversation.

## Capabilities

### Contacts
- Add new contacts (name, email, company, title)
- Find existing contacts by name or email
- Update contact information
- Log notes on contacts

### Companies
- Add new companies
- Find companies by name
- Update company information

### Deals
- Create new deals
- Update deal stages
- View deal pipeline summary
- List deals by stage

### Tasks
- Create follow-up tasks
- Set due dates and priorities
- Associate tasks with contacts or deals
- Mark tasks as complete
- List open tasks

### Notes
- Log notes on contacts, deals, or companies
- View recent notes

## Guidelines

1. When creating contacts, try to extract as much info as possible:
   - Name (first and last)
   - Email if mentioned
   - Company name
   - Job title

2. When the user mentions "follow up", create a task with an appropriate due date.

3. Use context to resolve references like "her", "that deal", "them":
   - If they just mentioned Maria Lopez, "her" means Maria
   - If they just created a deal, "the deal" means that deal

4. Confirm actions taken with clear summaries:
   - "Added Maria Lopez to HubSpot (TechStartup, CTO)"
   - "Created task: Follow up with Maria Lopez — due Jan 22"

5. When searching, be helpful about partial matches:
   - "I found 3 contacts named Johnson — which one?"

6. Format responses cleanly for Slack:
   - Use bullet points for lists
   - Bold important info
   - Keep it concise`;

export class HubSpotAgent {
  private api: HubSpotApiClient | null = null;
  private llm: LLMClient;

  constructor(db: Database.Database, llm: LLMClient) {
    this.llm = llm;

    // Initialize API client if token is available
    const accessToken = process.env.HUBSPOT_ACCESS_TOKEN;
    if (accessToken) {
      this.api = new HubSpotApiClient({ accessToken });
    }
  }

  // Main handler for HubSpot-related messages
  async handle(
    message: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
    entities: ExtractedEntity[]
  ): Promise<AgentResponse> {
    if (!this.api) {
      return {
        message: "HubSpot is not configured. Please add HUBSPOT_ACCESS_TOKEN to your environment."
      };
    }

    const tools = this.getTools();

    // Build context about resolved entities
    let contextAddition = '';
    if (entities.length > 0) {
      const resolvedEntities = entities.filter(e => e.resolved_id);
      if (resolvedEntities.length > 0) {
        contextAddition = '\n\nContext from conversation:\n' +
          resolvedEntities.map(e => `- "${e.value}" refers to ${e.resolved_name} (ID: ${e.resolved_id})`).join('\n');
      }
    }

    const response = await this.llm.chat(
      message + contextAddition,
      history.map(h => ({ role: h.role, content: h.content })),
      {
        systemPrompt: HUBSPOT_AGENT_SYSTEM_PROMPT,
        tools,
        maxSteps: 10
      }
    );

    // Extract entities from the response for context tracking
    const responseEntities = await this.extractEntitiesFromResponse(response);

    return {
      message: response,
      entities: responseEntities
    };
  }

  // Extract entities mentioned in the response
  private async extractEntitiesFromResponse(response: string): Promise<EntityRef[]> {
    const entities: EntityRef[] = [];

    // Simple pattern matching for common formats
    // "Added Maria Lopez" or "Created contact: Maria Lopez"
    const contactPattern = /(?:Added|Created contact:?)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/g;
    let match;
    while ((match = contactPattern.exec(response)) !== null) {
      entities.push({
        type: 'contact',
        id: 'pending', // Will be resolved on next message
        name: match[1],
        mentionedAt: new Date().toISOString()
      });
    }

    // "Created deal: Deal Name" or "Deal: Deal Name"
    const dealPattern = /(?:Created deal:?|Deal:)\s+([^\n—]+)/g;
    while ((match = dealPattern.exec(response)) !== null) {
      entities.push({
        type: 'deal',
        id: 'pending',
        name: match[1].trim(),
        mentionedAt: new Date().toISOString()
      });
    }

    return entities;
  }

  // Get tools for this agent
  private getTools() {
    if (!this.api) return {};

    const api = this.api;

    return {
      addContact: tool({
        description: "Add a new contact to HubSpot",
        inputSchema: z.object({
          firstName: z.string().optional().describe("First name"),
          lastName: z.string().optional().describe("Last name"),
          email: z.string().optional().describe("Email address"),
          company: z.string().optional().describe("Company name"),
          title: z.string().optional().describe("Job title"),
          phone: z.string().optional().describe("Phone number")
        }),
        execute: async (input) => {
          const contact = await this.addContact(input);
          return JSON.stringify(contact);
        }
      }),

      findContact: tool({
        description: "Search for contacts by name or email",
        inputSchema: z.object({
          query: z.string().describe("Search query (name or email)")
        }),
        execute: async ({ query }) => {
          const contacts = await api.searchContacts(query);
          return JSON.stringify(contacts);
        }
      }),

      updateContact: tool({
        description: "Update a contact's information",
        inputSchema: z.object({
          id: z.string().describe("Contact ID"),
          firstName: z.string().optional(),
          lastName: z.string().optional(),
          email: z.string().optional(),
          company: z.string().optional(),
          title: z.string().optional(),
          phone: z.string().optional()
        }),
        execute: async ({ id, ...updates }) => {
          const props: Record<string, string> = {};
          if (updates.firstName) props.firstname = updates.firstName;
          if (updates.lastName) props.lastname = updates.lastName;
          if (updates.email) props.email = updates.email;
          if (updates.company) props.company = updates.company;
          if (updates.title) props.jobtitle = updates.title;
          if (updates.phone) props.phone = updates.phone;

          const contact = await api.updateContact(id, props);
          return JSON.stringify(contact);
        }
      }),

      listContacts: tool({
        description: "List all contacts",
        inputSchema: z.object({
          limit: z.number().optional().describe("Max number of contacts to return")
        }),
        execute: async ({ limit }) => {
          const contacts = await api.listContacts(limit || 20);
          return JSON.stringify(contacts);
        }
      }),

      addCompany: tool({
        description: "Add a new company to HubSpot",
        inputSchema: z.object({
          name: z.string().describe("Company name"),
          domain: z.string().optional().describe("Company website domain"),
          industry: z.string().optional().describe("Industry")
        }),
        execute: async (input) => {
          const company = await this.addCompany(input);
          return JSON.stringify(company);
        }
      }),

      findCompany: tool({
        description: "Search for companies by name",
        inputSchema: z.object({
          query: z.string().describe("Search query")
        }),
        execute: async ({ query }) => {
          const companies = await api.searchCompanies(query);
          return JSON.stringify(companies);
        }
      }),

      createDeal: tool({
        description: "Create a new deal",
        inputSchema: z.object({
          name: z.string().describe("Deal name"),
          stage: z.string().optional().describe("Deal stage"),
          amount: z.number().optional().describe("Deal amount"),
          closeDate: z.string().optional().describe("Expected close date (YYYY-MM-DD)"),
          pipeline: z.string().optional().describe("Pipeline name/ID")
        }),
        execute: async (input) => {
          const deal = await this.createDeal(input);
          return JSON.stringify(deal);
        }
      }),

      updateDealStage: tool({
        description: "Update a deal's stage",
        inputSchema: z.object({
          id: z.string().describe("Deal ID"),
          stage: z.string().describe("New stage name or ID")
        }),
        execute: async ({ id, stage }) => {
          const deal = await api.updateDeal(id, { dealstage: stage });
          return JSON.stringify(deal);
        }
      }),

      listDeals: tool({
        description: "List all deals",
        inputSchema: z.object({
          limit: z.number().optional().describe("Max number of deals to return")
        }),
        execute: async ({ limit }) => {
          const deals = await api.listDeals(limit || 20);
          return JSON.stringify(deals);
        }
      }),

      pipelineSummary: tool({
        description: "Get a summary of the deal pipeline",
        inputSchema: z.object({}),
        execute: async () => {
          const [pipelines, deals] = await Promise.all([
            api.getPipelines(),
            api.listDeals(100)
          ]);
          return JSON.stringify({ pipelines, deals });
        }
      }),

      createTask: tool({
        description: "Create a new task/follow-up",
        inputSchema: z.object({
          subject: z.string().describe("Task subject"),
          body: z.string().optional().describe("Task description"),
          dueDate: z.string().optional().describe("Due date (YYYY-MM-DD)"),
          priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional().describe("Priority"),
          associatedContactId: z.string().optional().describe("Contact ID to associate with"),
          associatedDealId: z.string().optional().describe("Deal ID to associate with")
        }),
        execute: async (input) => {
          const task = await this.createTask(input);
          return JSON.stringify(task);
        }
      }),

      completeTask: tool({
        description: "Mark a task as complete",
        inputSchema: z.object({
          id: z.string().describe("Task ID")
        }),
        execute: async ({ id }) => {
          const task = await api.updateTask(id, { hs_task_status: 'COMPLETED' });
          return JSON.stringify(task);
        }
      }),

      listTasks: tool({
        description: "List open tasks",
        inputSchema: z.object({
          limit: z.number().optional().describe("Max number of tasks to return")
        }),
        execute: async ({ limit }) => {
          const tasks = await api.listTasks(limit || 20);
          return JSON.stringify(tasks);
        }
      }),

      logNote: tool({
        description: "Log a note on a contact, deal, or company",
        inputSchema: z.object({
          body: z.string().describe("Note content"),
          contactId: z.string().optional().describe("Contact ID to attach note to"),
          dealId: z.string().optional().describe("Deal ID to attach note to"),
          companyId: z.string().optional().describe("Company ID to attach note to")
        }),
        execute: async (input) => {
          const note = await this.logNote(input);
          return JSON.stringify(note);
        }
      })
    };
  }

  // Helper methods

  async addContact(input: CreateContactInput): Promise<HubSpotContact> {
    if (!this.api) throw new Error('HubSpot not configured');

    const properties: Record<string, string> = {};
    if (input.firstName) properties.firstname = input.firstName;
    if (input.lastName) properties.lastname = input.lastName;
    if (input.email) properties.email = input.email;
    if (input.company) properties.company = input.company;
    if (input.title) properties.jobtitle = input.title;
    if (input.phone) properties.phone = input.phone;

    const contact = await this.api.createContact(properties);

    // If company name provided, try to find or create company and associate
    if (input.company) {
      try {
        const companies = await this.api.searchCompanies(input.company);
        let companyId: string;

        if (companies.length > 0) {
          companyId = companies[0].id;
        } else {
          const newCompany = await this.api.createCompany({ name: input.company });
          companyId = newCompany.id;
        }

        await this.api.associateContactToCompany(contact.id, companyId);
      } catch (e) {
        // Non-fatal - contact was still created
        console.warn('Failed to associate contact with company:', e);
      }
    }

    return contact;
  }

  async addCompany(input: CreateCompanyInput): Promise<any> {
    if (!this.api) throw new Error('HubSpot not configured');

    const properties: Record<string, string> = { name: input.name };
    if (input.domain) properties.domain = input.domain;
    if (input.industry) properties.industry = input.industry;

    return this.api.createCompany(properties);
  }

  async createDeal(input: CreateDealInput): Promise<HubSpotDeal> {
    if (!this.api) throw new Error('HubSpot not configured');

    const properties: Record<string, string> = { dealname: input.name };
    if (input.stage) properties.dealstage = input.stage;
    if (input.amount) properties.amount = input.amount.toString();
    if (input.closeDate) properties.closedate = input.closeDate;
    if (input.pipeline) properties.pipeline = input.pipeline;

    return this.api.createDeal(properties);
  }

  async createTask(input: CreateTaskInput): Promise<any> {
    if (!this.api) throw new Error('HubSpot not configured');

    const properties: Record<string, string> = {
      hs_task_subject: input.subject,
      hs_task_status: 'NOT_STARTED'
    };

    if (input.body) properties.hs_task_body = input.body;
    if (input.dueDate) properties.hs_timestamp = new Date(input.dueDate).getTime().toString();
    if (input.priority) properties.hs_task_priority = input.priority;

    const task = await this.api.createTask(properties);

    // Associate with contact or deal if specified
    if (input.associatedContactId) {
      await this.api.associateTaskTo(task.id, 'contacts', input.associatedContactId);
    }
    if (input.associatedDealId) {
      await this.api.associateTaskTo(task.id, 'deals', input.associatedDealId);
    }

    return task;
  }

  async logNote(input: CreateNoteInput): Promise<any> {
    if (!this.api) throw new Error('HubSpot not configured');

    const properties: Record<string, string> = {
      hs_note_body: input.body,
      hs_timestamp: Date.now().toString()
    };

    const note = await this.api.createNote(properties);

    // Associate with entities
    if (input.associatedContactId) {
      await this.api.associateNoteTo(note.id, 'contacts', input.associatedContactId);
    }
    if (input.associatedDealId) {
      await this.api.associateNoteTo(note.id, 'deals', input.associatedDealId);
    }
    if (input.associatedCompanyId) {
      await this.api.associateNoteTo(note.id, 'companies', input.associatedCompanyId);
    }

    return note;
  }
}
