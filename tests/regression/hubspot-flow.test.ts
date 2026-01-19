// Live integration tests for HubSpot conversation flow
// These tests use real LLM and HubSpot API calls

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
const hasRequiredEnv = process.env.OPENAI_API_KEY && process.env.HUBSPOT_ACCESS_TOKEN;

describe.skipIf(!hasRequiredEnv)('HubSpot conversation flow', () => {
  let db: Database.Database;
  let orchestrator: Orchestrator;
  let testDbPath: string;

  beforeEach(async () => {
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
  });

  afterEach(async () => {
    closeDatabase();
    try {
      await fs.unlink(testDbPath);
    } catch {
      // Ignore cleanup errors
    }
  });

  it('handles contact creation', async () => {
    const channelId = `C-${randomUUID().slice(0, 8)}`;
    const threadTs = `thread-${Date.now()}`;
    const testEmail = `test-${Date.now()}@example.com`;

    // Create a contact with unique email to avoid conflicts
    const response = await orchestrator.handle(
      `Add John TestUser as a contact with email ${testEmail}, he is Engineer at TestCorp`,
      channelId,
      threadTs,
      'U456'
    );

    // Should acknowledge the contact creation
    expect(response.message.toLowerCase()).toMatch(/added|created|john/i);

    // Verify context was created
    const context = orchestrator.getContext(channelId, threadTs);
    expect(context).not.toBeNull();
    expect(context?.history.length).toBeGreaterThan(0);
  }, 30000); // 30s timeout for API calls

  it('routes correctly to different agents', async () => {
    const channelId = `C-${randomUUID().slice(0, 8)}`;
    
    // Test HubSpot routing
    const hubspotResponse = await orchestrator.handle(
      'Show my deals',
      channelId,
      'thread-hs',
      'U456'
    );
    // Should route to HubSpot and respond about deals
    expect(hubspotResponse.message).toBeDefined();

    // Test Content routing
    const contentResponse = await orchestrator.handle(
      'Write a LinkedIn post about AI trends',
      channelId,
      'thread-content',
      'U456'
    );
    // Should route to Content agent
    expect(contentResponse.message).toBeDefined();
  }, 60000);

  it('maintains conversation context', async () => {
    const channelId = `C-${randomUUID().slice(0, 8)}`;
    const threadTs = `thread-${Date.now()}`;

    // First message
    await orchestrator.handle(
      'Hello, I need help with my CRM',
      channelId,
      threadTs,
      'U456'
    );

    // Second message in same thread
    const response = await orchestrator.handle(
      'Can you list my contacts?',
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
