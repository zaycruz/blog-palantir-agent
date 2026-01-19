// Live integration tests for Content Agent conversation flow
// These tests use real LLM calls

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { Orchestrator } from '../../src/orchestrator/index.js';
import { initializeDatabase, closeDatabase } from '../../src/db/index.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';

// Load environment variables
config();

// Skip if no API keys configured
const hasRequiredEnv = process.env.OPENAI_API_KEY;

describe.skipIf(!hasRequiredEnv)('Content Agent conversation flow', () => {
  let db: Database.Database;
  let orchestrator: Orchestrator;
  let testDbPath: string;

  beforeEach(async () => {
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
  });

  afterEach(async () => {
    closeDatabase();
    try {
      await fs.unlink(testDbPath);
    } catch {
      // Ignore cleanup errors
    }
  });

  it('handles draft creation request', async () => {
    const channelId = `C-${randomUUID().slice(0, 8)}`;
    const threadTs = `thread-${Date.now()}`;

    const response = await orchestrator.handle(
      'Write a LinkedIn post about why startups should focus on one problem',
      channelId,
      threadTs,
      'U456'
    );

    // Should create or discuss creating a draft
    expect(response.message).toBeDefined();
    expect(response.message.length).toBeGreaterThan(50);

    // Verify context was created
    const context = orchestrator.getContext(channelId, threadTs);
    expect(context).not.toBeNull();
  }, 30000);

  it('handles topic queue management', async () => {
    const channelId = `C-${randomUUID().slice(0, 8)}`;
    const threadTs = `thread-${Date.now()}`;

    const response = await orchestrator.handle(
      'Add topic: Data mesh vs data fabric for SMBs',
      channelId,
      threadTs,
      'U456'
    );

    // Should acknowledge adding the topic
    expect(response.message).toBeDefined();
    expect(response.message.toLowerCase()).toMatch(/topic|added|queue/i);
  }, 30000);

  it('routes content requests correctly', async () => {
    const channelId = `C-${randomUUID().slice(0, 8)}`;

    // Content-related request should route to content agent
    const response = await orchestrator.handle(
      'Show my drafts',
      channelId,
      'thread-1',
      'U456'
    );

    expect(response.message).toBeDefined();
  }, 30000);

  it('maintains conversation context for content', async () => {
    const channelId = `C-${randomUUID().slice(0, 8)}`;
    const threadTs = `thread-${Date.now()}`;

    // First turn
    await orchestrator.handle(
      'I want to write about AI implementation',
      channelId,
      threadTs,
      'U456'
    );

    // Follow-up
    const response = await orchestrator.handle(
      'Focus on common mistakes companies make',
      channelId,
      threadTs,
      'U456'
    );

    // Context should have history
    const context = orchestrator.getContext(channelId, threadTs);
    expect(context?.history.length).toBeGreaterThanOrEqual(2);
    expect(response.message).toBeDefined();
  }, 60000);
});
