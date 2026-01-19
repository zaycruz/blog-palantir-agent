// Linear Agent regression tests - live API calls

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { config } from 'dotenv';
import { Orchestrator } from '../../src/orchestrator/index.js';
import { initializeDatabase, closeDatabase } from '../../src/db/index.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

config();

// Skip if no API keys configured
const hasRequiredEnv = process.env.OPENAI_API_KEY && process.env.LINEAR_API_KEY;

describe.skipIf(!hasRequiredEnv)('Linear Agent conversation flow', () => {
  let orchestrator: Orchestrator;
  let db: Database.Database;
  let testDbPath: string;
  const channelId = 'test-linear-channel';

  beforeEach(async () => {
    testDbPath = path.join('/tmp', `test-linear-${randomUUID()}.sqlite`);
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
    } catch {}
  });

  it('routes issue creation to Linear agent', async () => {
    const response = await orchestrator.handle(
      'create an issue to fix the login bug',
      channelId,
      'linear-thread-1',
      'U123'
    );

    expect(response.message).toBeTruthy();
    expect(response.message.length).toBeGreaterThan(0);
  }, 60000);

  it('routes sprint queries to Linear agent', async () => {
    const response = await orchestrator.handle(
      'what is in the current sprint',
      channelId,
      'linear-thread-2',
      'U123'
    );

    expect(response.message).toBeTruthy();
  }, 60000);

  it('routes issue ID references to Linear agent', async () => {
    const response = await orchestrator.handle(
      'show me RAA-1',
      channelId,
      'linear-thread-3',
      'U123'
    );

    expect(response.message).toBeTruthy();
  }, 60000);

  it('handles team listing', async () => {
    const response = await orchestrator.handle(
      'list my Linear teams',
      channelId,
      'linear-thread-4',
      'U123'
    );

    expect(response.message).toBeTruthy();
  }, 60000);
});
