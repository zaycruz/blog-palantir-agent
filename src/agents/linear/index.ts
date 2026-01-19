// Linear Agent - handles project management operations

import Database from 'better-sqlite3';
import { z } from 'zod';
import { tool } from 'ai';
import { LLMClient } from '../../shared/llm.js';
import { LinearApiClient } from './api.js';
import { AgentResponse, ExtractedEntity, EntityRef } from '../../shared/types.js';
import { getSkillsPrompt } from '../../shared/skills.js';

const LINEAR_AGENT_BASE_PROMPT = `You are a Linear project management assistant. You help manage issues, track projects, and keep the team organized.

## Capabilities

### Issues
- Create new issues with title, description, priority
- Update issue status, priority, assignee
- Search for issues by keyword
- List your assigned issues
- View issue details

### Projects
- View project progress
- List issues in a project

### Cycles/Sprints
- View current cycle and its issues
- Check sprint progress

### Comments
- Add comments to issues

## Priority Levels
- 0 = No priority
- 1 = Urgent
- 2 = High
- 3 = Medium
- 4 = Low

## Guidelines

1. When creating issues:
   - Extract a clear, actionable title
   - Include relevant context in description
   - Suggest appropriate priority based on urgency words
   - Ask for team if not specified

2. When updating issues:
   - Confirm which issue before making changes
   - Use issue identifier (e.g., "ENG-123") when possible

3. Format responses for Slack:
   - Use bullet points for lists
   - Bold important info (identifiers, status)
   - Include links to issues

4. Be proactive:
   - Summarize issue counts by status
   - Highlight blockers or urgent items
   - Suggest next actions`;

export class LinearAgent {
  private api: LinearApiClient | null = null;
  private llm: LLMClient;
  private defaultTeamId: string | null = null;

  constructor(db: Database.Database, llm: LLMClient) {
    this.llm = llm;

    const apiKey = process.env.LINEAR_API_KEY;
    if (apiKey) {
      this.api = new LinearApiClient({ apiKey });
    }
  }

  async handle(
    message: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
    entities: ExtractedEntity[]
  ): Promise<AgentResponse> {
    if (!this.api) {
      return {
        message: "Linear is not configured. Please add LINEAR_API_KEY to your environment."
      };
    }

    // Load skills and build system prompt
    const skillsPrompt = getSkillsPrompt('linear');
    const systemPrompt = LINEAR_AGENT_BASE_PROMPT + skillsPrompt;

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
        systemPrompt,
        tools,
        maxSteps: 10
      }
    );

    // Extract entities from response for context tracking
    const responseEntities = this.extractEntitiesFromResponse(response);

    return {
      message: response,
      entities: responseEntities
    };
  }

  private extractEntitiesFromResponse(response: string): EntityRef[] {
    const entities: EntityRef[] = [];

    // Extract issue identifiers like ENG-123, PROJ-456
    const issuePattern = /\b([A-Z]+-\d+)\b/g;
    let match;
    while ((match = issuePattern.exec(response)) !== null) {
      entities.push({
        type: 'deal', // Using 'deal' as a proxy for 'issue'
        id: match[1],
        name: match[1],
        mentionedAt: new Date().toISOString()
      });
    }

    return entities;
  }

  private getTools() {
    if (!this.api) return {};

    const api = this.api;

    return {
      createIssue: tool({
        description: "Create a new issue in Linear",
        inputSchema: z.object({
          title: z.string().describe("Issue title"),
          description: z.string().optional().describe("Issue description"),
          teamId: z.string().describe("Team ID to create issue in"),
          priority: z.number().min(0).max(4).optional().describe("Priority: 0=none, 1=urgent, 2=high, 3=medium, 4=low"),
          assigneeId: z.string().optional().describe("User ID to assign to"),
          projectId: z.string().optional().describe("Project ID to add to")
        }),
        execute: async (input) => {
          const issue = await api.createIssue(input);
          return JSON.stringify(issue);
        }
      }),

      updateIssue: tool({
        description: "Update an existing issue",
        inputSchema: z.object({
          id: z.string().describe("Issue ID or identifier (e.g., ENG-123)"),
          title: z.string().optional().describe("New title"),
          description: z.string().optional().describe("New description"),
          priority: z.number().min(0).max(4).optional().describe("New priority"),
          stateId: z.string().optional().describe("New state/status ID"),
          assigneeId: z.string().optional().describe("New assignee ID")
        }),
        execute: async (input) => {
          const issue = await api.updateIssue(input);
          return JSON.stringify(issue);
        }
      }),

      searchIssues: tool({
        description: "Search for issues by keyword",
        inputSchema: z.object({
          query: z.string().describe("Search query"),
          limit: z.number().optional().describe("Max results (default 20)")
        }),
        execute: async ({ query, limit }) => {
          const issues = await api.searchIssues(query, limit || 20);
          return JSON.stringify(issues);
        }
      }),

      getMyIssues: tool({
        description: "Get issues assigned to the current user",
        inputSchema: z.object({
          limit: z.number().optional().describe("Max results (default 20)")
        }),
        execute: async ({ limit }) => {
          const issues = await api.getMyIssues(limit || 20);
          return JSON.stringify(issues);
        }
      }),

      getIssue: tool({
        description: "Get details of a specific issue by identifier",
        inputSchema: z.object({
          identifier: z.string().describe("Issue identifier (e.g., ENG-123)")
        }),
        execute: async ({ identifier }) => {
          const issue = await api.getIssue(identifier);
          return issue ? JSON.stringify(issue) : 'Issue not found';
        }
      }),

      addComment: tool({
        description: "Add a comment to an issue",
        inputSchema: z.object({
          issueId: z.string().describe("Issue ID"),
          body: z.string().describe("Comment text (supports markdown)")
        }),
        execute: async (input) => {
          const comment = await api.addComment(input);
          return JSON.stringify(comment);
        }
      }),

      getTeams: tool({
        description: "List all teams in the workspace",
        inputSchema: z.object({}),
        execute: async () => {
          const teams = await api.getTeams();
          return JSON.stringify(teams);
        }
      }),

      getProjects: tool({
        description: "List all projects",
        inputSchema: z.object({
          limit: z.number().optional().describe("Max results (default 20)")
        }),
        execute: async ({ limit }) => {
          const projects = await api.getProjects(limit || 20);
          return JSON.stringify(projects);
        }
      }),

      getCurrentCycle: tool({
        description: "Get the current active cycle/sprint for a team",
        inputSchema: z.object({
          teamId: z.string().describe("Team ID")
        }),
        execute: async ({ teamId }) => {
          const cycle = await api.getCurrentCycle(teamId);
          return cycle ? JSON.stringify(cycle) : 'No active cycle';
        }
      }),

      getWorkflowStates: tool({
        description: "Get available workflow states for a team (for updating issue status)",
        inputSchema: z.object({
          teamId: z.string().describe("Team ID")
        }),
        execute: async ({ teamId }) => {
          const states = await api.getWorkflowStates(teamId);
          return JSON.stringify(states);
        }
      }),

      getTeamMembers: tool({
        description: "Get members of a team (for assigning issues)",
        inputSchema: z.object({
          teamId: z.string().describe("Team ID")
        }),
        execute: async ({ teamId }) => {
          const members = await api.getTeamMembers(teamId);
          return JSON.stringify(members);
        }
      })
    };
  }
}
