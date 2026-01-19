// End-to-end tests for the orchestrator
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { Orchestrator } from '../../src/orchestrator/index.js';
import 'dotenv/config';

// Helper to run migrations (copied from db/index.ts since it's not exported)
function runMigrations(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const migrations = [
    { name: '001_create_conversation_contexts', sql: `CREATE TABLE conversation_contexts (id TEXT PRIMARY KEY, slack_channel_id TEXT NOT NULL, slack_thread_ts TEXT, user_id TEXT NOT NULL, active_agent TEXT, history TEXT NOT NULL DEFAULT '[]', entities TEXT NOT NULL DEFAULT '{"contacts":[],"deals":[],"companies":[]}', created_at TEXT NOT NULL, last_activity_at TEXT NOT NULL, expires_at TEXT NOT NULL); CREATE INDEX idx_context_channel ON conversation_contexts(slack_channel_id);` },
    { name: '002_create_drafts', sql: `CREATE TABLE drafts (id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL, content_type TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', feedback TEXT);` },
    { name: '003_create_interviews', sql: `CREATE TABLE interviews (id TEXT PRIMARY KEY, question TEXT NOT NULL, answer TEXT NOT NULL, created_at TEXT NOT NULL);` },
    { name: '004_create_topics', sql: `CREATE TABLE topics (id TEXT PRIMARY KEY, topic TEXT NOT NULL, notes TEXT, created_at TEXT NOT NULL);` },
    { name: '005_create_research_items', sql: `CREATE TABLE research_items (id TEXT PRIMARY KEY, date TEXT NOT NULL, source TEXT NOT NULL, url TEXT NOT NULL, title TEXT NOT NULL, summary TEXT NOT NULL, tags TEXT NOT NULL DEFAULT '[]', used_in_post INTEGER NOT NULL DEFAULT 0);` },
    { name: '006_create_signal_log', sql: `CREATE TABLE signal_log (id TEXT PRIMARY KEY, date TEXT NOT NULL, source TEXT NOT NULL, observation TEXT NOT NULL, potential_angle TEXT NOT NULL, frequency INTEGER NOT NULL DEFAULT 1);` },
    { name: '007_create_hubspot_cache', sql: `CREATE TABLE hubspot_cache (id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, hubspot_id TEXT NOT NULL, data TEXT NOT NULL, cached_at TEXT NOT NULL, UNIQUE(entity_type, hubspot_id));` }
  ];

  for (const migration of migrations) {
    const applied = database.prepare('SELECT 1 FROM migrations WHERE name = ?').get(migration.name);
    if (!applied) {
      console.log(`Applying migration: ${migration.name}`);
      database.exec(migration.sql);
      database.prepare('INSERT INTO migrations (name) VALUES (?)').run(migration.name);
    }
  }
}

describe('Orchestrator E2E', () => {
  let db: Database.Database;
  let orchestrator: Orchestrator;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
    
    orchestrator = new Orchestrator(db, {
      llm: {
        provider: 'openai',
        model: 'gpt-4o-mini',
        apiKey: process.env.OPENAI_API_KEY!
      }
    });
  });

  afterEach(() => {
    db.close();
  });

  describe('Routing', () => {
    it('routes HubSpot queries to HubSpot agent', async () => {
      const response = await orchestrator.handle(
        'Add a contact named John Smith with email john@example.com',
        'test-channel-1'
      );

      expect(response.message).toBeTruthy();
      // Should mention creating/adding the contact
      expect(response.message.toLowerCase()).toMatch(/john|contact|added|created/i);
    }, 30000);

    it('routes content queries to Content agent', async () => {
      const response = await orchestrator.handle(
        'Write a LinkedIn post about AI in healthcare',
        'test-channel-2'
      );

      expect(response.message).toBeTruthy();
      // Should have content-related response
      expect(response.message.length).toBeGreaterThan(50);
    }, 30000);

    it('handles general queries appropriately', async () => {
      const response = await orchestrator.handle(
        'Hello, how are you?',
        'test-channel-3'
      );

      expect(response.message).toBeTruthy();
      // Should be a friendly response
      expect(response.message.length).toBeGreaterThan(10);
    }, 30000);

    it('maintains context across messages', async () => {
      // First message - HubSpot context
      await orchestrator.handle(
        'Look up the contact Sarah Connor',
        'test-channel-4'
      );

      // Follow-up should stay in HubSpot context
      const response = await orchestrator.handle(
        'What deals does she have?',
        'test-channel-4'
      );

      expect(response.message).toBeTruthy();
      // Should be about deals/HubSpot, not confused
    }, 60000);
  });

  describe('HubSpot Agent', () => {
    it('creates a contact', async () => {
      const email = `test-e2e-${Date.now()}@example.com`;
      const response = await orchestrator.handle(
        `Create a contact: Jane Doe, email ${email}, company Acme Corp`,
        'test-hubspot-1'
      );

      expect(response.message).toBeTruthy();
      expect(response.message.toLowerCase()).toMatch(/jane|doe|created|added|contact/i);
    }, 30000);

    it('searches for contacts', async () => {
      const response = await orchestrator.handle(
        'Find all contacts from example.com',
        'test-hubspot-2'
      );

      expect(response.message).toBeTruthy();
      // Should mention contacts or search results
    }, 30000);

    it('handles deal operations', async () => {
      const response = await orchestrator.handle(
        'Create a deal called "Test Deal" worth $5000',
        'test-hubspot-3'
      );

      expect(response.message).toBeTruthy();
      expect(response.message.toLowerCase()).toMatch(/deal|created|test/i);
    }, 30000);
  });

  describe('Content Agent', () => {
    it('creates a draft', async () => {
      const response = await orchestrator.handle(
        'Write a LinkedIn post about the future of remote work',
        'test-content-1'
      );

      expect(response.message).toBeTruthy();
      expect(response.message.length).toBeGreaterThan(100);
    }, 30000);

    it('manages topic queue', async () => {
      // Add a topic
      await orchestrator.handle(
        'Add "AI in finance" to my content topics',
        'test-content-2'
      );

      // Check queue
      const response = await orchestrator.handle(
        'Show my topic queue',
        'test-content-2'
      );

      expect(response.message).toBeTruthy();
      expect(response.message.toLowerCase()).toMatch(/ai|finance|topic|queue/i);
    }, 60000);

    it('shows drafts', async () => {
      const response = await orchestrator.handle(
        'Show me my drafts',
        'test-content-3'
      );

      expect(response.message).toBeTruthy();
      // Should list drafts or say none exist
    }, 30000);
  });
});
