// Regression tests for Content Agent conversation flow

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { Orchestrator } from '../../src/orchestrator/index.js';
import { initializeDatabase, closeDatabase } from '../../src/db/index.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

// Mock fetch for LLM and Tavily
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock environment
const originalEnv = process.env;

describe('Content Agent conversation flow', () => {
  let db: Database.Database;
  let orchestrator: Orchestrator;
  let testDbPath: string;

  beforeEach(async () => {
    // Set up mock environment
    process.env = {
      ...originalEnv,
      OPENAI_API_KEY: 'test-key',
      TAVILY_API_KEY: 'test-tavily-key'
    };

    // Create a unique test database
    testDbPath = path.join('/tmp', `test-content-${randomUUID()}.sqlite`);
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

  it('handles draft creation and approval flow', async () => {
    const llmResponses = [
      // First turn: Create draft
      `I've created a LinkedIn post draft for you:

**Why SMBs Don't Need Enterprise AI**

Most companies fail at AI because they start with AI.

They buy the biggest platform, hire the most expensive consultants, and wonder why nothing changes.

Here's what actually works:
1. Start with a real problem
2. Find the simplest solution
3. Only add AI if it helps

The best tech isn't impressive. It's invisible.

What's been your experience with "enterprise" solutions?

---

Draft ID: draft-123
Status: Pending`,

      // Second turn: Approve draft
      `Draft approved!

**Why SMBs Don't Need Enterprise AI**

The draft has been marked as approved and is ready for posting.`
    ];

    let llmCallCount = 0;

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
      return { ok: false, status: 404 };
    });

    const channelId = 'C123';
    const threadTs = 'thread-1';

    // Turn 1: Create draft
    const response1 = await orchestrator.handle(
      'Write a LinkedIn post about why SMBs dont need enterprise AI',
      channelId,
      threadTs,
      'U456'
    );

    expect(response1.message.toLowerCase()).toContain('draft');

    // Turn 2: Approve the draft (referring to "this")
    const response2 = await orchestrator.handle(
      'Looks good, approve it',
      channelId,
      threadTs,
      'U456'
    );

    expect(response2.message.toLowerCase()).toContain('approved');
  });

  it('handles research and synthesis flow', async () => {
    mockFetch.mockImplementation(async (url: string, options?: any) => {
      if (url.includes('openai')) {
        return {
          ok: true,
          json: async () => ({
            choices: [{
              message: {
                content: `I researched Palantir Foundry and found some interesting insights:

**Key Findings:**
1. Foundry's new AIP features are getting traction in manufacturing
2. Reddit users report mixed experiences with implementation timelines
3. Several case studies show 40% efficiency improvements in data operations

This could make a great LinkedIn post about realistic expectations for Foundry implementations.

Would you like me to draft something based on these findings?`,
                role: 'assistant'
              }
            }]
          })
        };
      }

      // Mock Tavily search
      if (url.includes('tavily.com/search')) {
        return {
          ok: true,
          json: async () => ({
            results: [
              {
                title: 'Palantir Foundry AIP Update',
                url: 'https://example.com/1',
                content: 'Palantir announced new AIP features...',
                score: 0.95
              },
              {
                title: 'Reddit: Foundry Implementation Stories',
                url: 'https://reddit.com/r/palantir',
                content: 'Mixed experiences reported...',
                score: 0.85
              }
            ]
          })
        };
      }

      return { ok: false, status: 404 };
    });

    const response = await orchestrator.handle(
      'Research whats new with Palantir Foundry and find some content angles',
      'C123',
      'thread-1',
      'U456'
    );

    expect(response.message.toLowerCase()).toContain('foundry');
    expect(response.message.toLowerCase()).toContain('findings');
  });

  it('handles topic queue management', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('openai')) {
        return {
          ok: true,
          json: async () => ({
            choices: [{
              message: {
                content: `Added topic to your content queue:

**Topic:** Data mesh vs data fabric for SMBs
**Notes:** Compare practical differences, not just theory

Your queue now has 1 topic. Let me know when you want to explore it!`,
                role: 'assistant'
              }
            }]
          })
        };
      }
      return { ok: false, status: 404 };
    });

    const response = await orchestrator.handle(
      'Add topic: Data mesh vs data fabric for SMBs - compare practical differences',
      'C123',
      'thread-1',
      'U456'
    );

    expect(response.message.toLowerCase()).toContain('topic');
    expect(response.message.toLowerCase()).toContain('queue');
  });

  it('handles interview-first workflow', async () => {
    const llmResponses = [
      // First response: Ask interview questions
      `Great topic! Before I draft anything, let me understand your perspective better:

1. What specific experience have you had with AI implementation at SMBs?
2. What's the most common mistake you've seen companies make?`,

      // Second response: Follow-up question
      `That's a great insight about starting too big. One more question:

What would you tell a CEO who's being pressured by their board to "do something with AI"?`,

      // Third response: Create draft based on interview
      `Perfect, I have a good sense of your voice now. Here's a draft:

**The AI Question Every CEO Hates**

"What's your AI strategy?"

I've heard this in every board meeting for the past 2 years.

Here's what I tell CEOs: Start smaller than you think.

[Draft continues...]`
    ];

    let llmCallCount = 0;

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
      return { ok: false, status: 404 };
    });

    const channelId = 'C123';
    const threadTs = 'thread-1';

    // Turn 1: Request content
    const response1 = await orchestrator.handle(
      'I want to write about AI implementation mistakes',
      channelId,
      threadTs,
      'U456'
    );

    expect(response1.message.toLowerCase()).toContain('question');

    // Turn 2: Answer first questions
    const response2 = await orchestrator.handle(
      'Companies always start too big. They buy Palantir before they have clean data.',
      channelId,
      threadTs,
      'U456'
    );

    // Should continue the interview
    expect(response2.message).toContain('?');

    // Turn 3: Answer follow-up
    const response3 = await orchestrator.handle(
      'I tell them to find one process that wastes time and fix that first',
      channelId,
      threadTs,
      'U456'
    );

    // Should have a draft now
    expect(response3.message.toLowerCase()).toContain('draft');
  });
});
