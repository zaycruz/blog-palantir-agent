// Regression tests for HubSpot conversation flow

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { Orchestrator } from '../../src/orchestrator/index.js';
import { initializeDatabase, closeDatabase } from '../../src/db/index.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

// Mock fetch for HubSpot API
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock environment
const originalEnv = process.env;

describe('HubSpot conversation flow', () => {
  let db: Database.Database;
  let orchestrator: Orchestrator;
  let testDbPath: string;

  beforeEach(async () => {
    // Set up mock environment
    process.env = {
      ...originalEnv,
      OPENAI_API_KEY: 'test-key',
      HUBSPOT_ACCESS_TOKEN: 'test-hubspot-token'
    };

    // Create a unique test database
    testDbPath = path.join('/tmp', `test-hubspot-${randomUUID()}.sqlite`);
    db = await initializeDatabase({ path: testDbPath });

    orchestrator = new Orchestrator(db, {
      llm: {
        provider: 'openai',
        model: 'gpt-4o',
        maxTokens: 4096,
        temperature: 0.7
      }
    });

    // Reset fetch mock
    mockFetch.mockReset();
  });

  afterEach(async () => {
    process.env = originalEnv;
    closeDatabase();
    try {
      await fs.unlink(testDbPath);
    } catch {
      // Ignore cleanup errors
    }
  });

  it('handles multi-turn contact creation flow', async () => {
    // Mock LLM responses for the conversation
    const llmResponses = [
      // First turn: Add contact
      `I'll add Maria Lopez to HubSpot.

Added **Maria Lopez** to HubSpot:
- Company: TechStartup
- Title: CTO

Is there anything else you'd like to add to her record?`,

      // Second turn: Log note (with pronoun resolution)
      `Added note to **Maria Lopez**:

"Met at Denver conference"

The note has been linked to her contact record.`,

      // Third turn: Create task
      `Created task: **Follow up with Maria Lopez**
- Due: January 22, 2026
- Priority: Medium

I've linked this task to Maria's contact record.`
    ];

    let llmCallCount = 0;

    // Mock the LLM chat call
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('openai')) {
        const response = llmResponses[llmCallCount++] || 'OK';
        return {
          ok: true,
          json: async () => ({
            choices: [{
              message: {
                content: response,
                role: 'assistant'
              }
            }]
          })
        };
      }

      // Mock HubSpot API calls
      if (url.includes('hubapi.com')) {
        if (url.includes('contacts')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              id: 'contact-123',
              properties: {
                firstname: 'Maria',
                lastname: 'Lopez',
                company: 'TechStartup',
                jobtitle: 'CTO'
              }
            })
          };
        }
        if (url.includes('notes')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              id: 'note-123',
              properties: {
                hs_note_body: 'Met at Denver conference'
              }
            })
          };
        }
        if (url.includes('tasks')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              id: 'task-123',
              properties: {
                hs_task_subject: 'Follow up with Maria Lopez',
                hs_task_status: 'NOT_STARTED'
              }
            })
          };
        }
        // Association endpoints
        if (url.includes('associations')) {
          return { ok: true, status: 204 };
        }
      }

      return { ok: false, status: 404 };
    });

    // Simulate conversation
    const channelId = 'C123';
    const threadTs = 'thread-1';

    // Turn 1: Create contact
    const response1 = await orchestrator.handle(
      'Add Maria Lopez as a contact, she is CTO at TechStartup',
      channelId,
      threadTs,
      'U456'
    );

    expect(response1.message).toContain('Maria Lopez');

    // Verify context was created
    const context = orchestrator.getContext(channelId, threadTs);
    expect(context).not.toBeNull();
    expect(context?.history.length).toBeGreaterThan(0);

    // Turn 2: Follow-up with pronoun (should resolve "her" to Maria)
    const response2 = await orchestrator.handle(
      'Also log a note that we met at the Denver conference',
      channelId,
      threadTs,
      'U456'
    );

    // The response should reference Maria (pronoun resolved)
    expect(response2.message.toLowerCase()).toContain('maria');

    // Turn 3: Create task (continuing conversation)
    const response3 = await orchestrator.handle(
      'And create a follow-up task for next week',
      channelId,
      threadTs,
      'U456'
    );

    expect(response3.message.toLowerCase()).toContain('task');
    expect(response3.message.toLowerCase()).toContain('maria');
  });

  it('handles ambiguous requests by asking for clarification', async () => {
    // Mock LLM to return low-confidence classification
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('openai')) {
        return {
          ok: true,
          json: async () => ({
            choices: [{
              message: {
                content: JSON.stringify({
                  agent: 'general',
                  intent: 'Unclear request',
                  confidence: 0.3,
                  entities: []
                }),
                role: 'assistant'
              }
            }]
          })
        };
      }
      return { ok: false, status: 404 };
    });

    const response = await orchestrator.handle(
      'do the thing',
      'C123',
      'thread-1',
      'U456'
    );

    // Should ask for clarification
    expect(response.message.toLowerCase()).toContain('clarify');
  });

  it('maintains context across agent switches', async () => {
    // Set up context with a contact
    const channelId = 'C123';
    const threadTs = 'thread-1';

    // First, create a context with an entity
    const context = orchestrator.getContext(channelId, threadTs);
    expect(context).not.toBeNull();

    // Mock successful responses
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('openai')) {
        return {
          ok: true,
          json: async () => ({
            choices: [{
              message: {
                content: 'Draft created about Maria Lopez.',
                role: 'assistant'
              }
            }]
          })
        };
      }
      return { ok: false, status: 404 };
    });

    // First, talk to HubSpot agent
    await orchestrator.handle(
      'Add Maria Lopez as a contact',
      channelId,
      threadTs,
      'U456'
    );

    // Then switch to content agent but reference the contact
    const response = await orchestrator.handle(
      'Write a LinkedIn post about my meeting with her',
      channelId,
      threadTs,
      'U456'
    );

    // The context should have preserved the entity
    const updatedContext = orchestrator.getContext(channelId, threadTs);
    expect(updatedContext?.history.length).toBeGreaterThan(1);
  });
});
