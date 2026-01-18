// Unit tests for ContextManager

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { ContextManager } from '../../../src/orchestrator/context.js';
import { initializeDatabase, closeDatabase } from '../../../src/db/index.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

describe('ContextManager', () => {
  let db: Database.Database;
  let contextManager: ContextManager;
  let testDbPath: string;

  beforeEach(async () => {
    // Create a unique test database
    testDbPath = path.join('/tmp', `test-context-${randomUUID()}.sqlite`);
    db = await initializeDatabase({ path: testDbPath });
    contextManager = new ContextManager(db, {
      historyLength: 5,
      expirationMinutes: 30,
      maxEntitiesPerType: 3
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

  describe('getContext', () => {
    it('creates new context for new channel', () => {
      const context = contextManager.getContext('C123', 'thread-1', 'U456');

      expect(context.id).toBeDefined();
      expect(context.slackChannelId).toBe('C123');
      expect(context.slackThreadTs).toBe('thread-1');
      expect(context.userId).toBe('U456');
      expect(context.activeAgent).toBeNull();
      expect(context.history).toHaveLength(0);
    });

    it('returns existing context for same channel/thread', () => {
      const context1 = contextManager.getContext('C123', 'thread-1', 'U456');
      const context2 = contextManager.getContext('C123', 'thread-1', 'U456');

      expect(context1.id).toBe(context2.id);
    });

    it('creates separate contexts for different threads', () => {
      const context1 = contextManager.getContext('C123', 'thread-1');
      const context2 = contextManager.getContext('C123', 'thread-2');

      expect(context1.id).not.toBe(context2.id);
    });

    it('creates separate contexts for different channels', () => {
      const context1 = contextManager.getContext('C123', 'thread-1');
      const context2 = contextManager.getContext('C456', 'thread-1');

      expect(context1.id).not.toBe(context2.id);
    });
  });

  describe('addUserMessage', () => {
    it('adds user message to history', () => {
      const context = contextManager.getContext('C123', 'thread-1');
      contextManager.addUserMessage(context.id, 'Hello, world!');

      const history = contextManager.getHistoryForLLM(context.id);
      expect(history).toHaveLength(1);
      expect(history[0].role).toBe('user');
      expect(history[0].content).toBe('Hello, world!');
    });

    it('respects history length limit', () => {
      const context = contextManager.getContext('C123', 'thread-1');

      // Add more messages than the limit (5)
      for (let i = 0; i < 10; i++) {
        contextManager.addUserMessage(context.id, `Message ${i}`);
      }

      const history = contextManager.getHistoryForLLM(context.id);
      expect(history).toHaveLength(5);
      expect(history[0].content).toBe('Message 5');
      expect(history[4].content).toBe('Message 9');
    });
  });

  describe('addAssistantMessage', () => {
    it('adds assistant message with agent type', () => {
      const context = contextManager.getContext('C123', 'thread-1');
      contextManager.addAssistantMessage(context.id, 'Hello!', 'content');

      const fullContext = contextManager.getFullContext(context.id);
      expect(fullContext?.history[0].agent).toBe('content');
    });
  });

  describe('setActiveAgent', () => {
    it('sets the active agent', () => {
      const context = contextManager.getContext('C123', 'thread-1');
      contextManager.setActiveAgent(context.id, 'hubspot');

      expect(contextManager.getActiveAgent(context.id)).toBe('hubspot');
    });

    it('can clear the active agent', () => {
      const context = contextManager.getContext('C123', 'thread-1');
      contextManager.setActiveAgent(context.id, 'hubspot');
      contextManager.setActiveAgent(context.id, null);

      expect(contextManager.getActiveAgent(context.id)).toBeNull();
    });
  });

  describe('entity management', () => {
    it('adds entity reference', () => {
      const context = contextManager.getContext('C123', 'thread-1');
      contextManager.addEntityReference(context.id, {
        type: 'contact',
        id: 'contact-123',
        name: 'Maria Lopez',
        mentionedAt: new Date().toISOString()
      });

      const entity = contextManager.getRecentEntity(context.id, 'contact');
      expect(entity).not.toBeNull();
      expect(entity!.name).toBe('Maria Lopez');
    });

    it('respects max entities per type', () => {
      const context = contextManager.getContext('C123', 'thread-1');

      // Add more contacts than the limit (3)
      for (let i = 0; i < 5; i++) {
        contextManager.addEntityReference(context.id, {
          type: 'contact',
          id: `contact-${i}`,
          name: `Contact ${i}`,
          mentionedAt: new Date().toISOString()
        });
      }

      const fullContext = contextManager.getFullContext(context.id);
      expect(fullContext?.entities.contacts).toHaveLength(3);

      // Should keep the most recent ones
      const recent = contextManager.getRecentEntity(context.id, 'contact');
      expect(recent!.name).toBe('Contact 4');
    });

    it('updates existing entity timestamp', () => {
      const context = contextManager.getContext('C123', 'thread-1');
      const earlierTime = new Date(Date.now() - 60000).toISOString();

      contextManager.addEntityReference(context.id, {
        type: 'contact',
        id: 'contact-123',
        name: 'Maria Lopez',
        mentionedAt: earlierTime
      });

      const laterTime = new Date().toISOString();
      contextManager.addEntityReference(context.id, {
        type: 'contact',
        id: 'contact-123',
        name: 'Maria Lopez',
        mentionedAt: laterTime
      });

      const fullContext = contextManager.getFullContext(context.id);
      expect(fullContext?.entities.contacts).toHaveLength(1);
      expect(fullContext?.entities.contacts[0].mentionedAt).toBe(laterTime);
    });
  });

  describe('resolvePronoun', () => {
    it('resolves "her" to recent contact', () => {
      const context = contextManager.getContext('C123', 'thread-1');
      contextManager.addEntityReference(context.id, {
        type: 'contact',
        id: 'contact-123',
        name: 'Maria Lopez',
        mentionedAt: new Date().toISOString()
      });

      const resolved = contextManager.resolvePronoun(context.id, 'her');
      expect(resolved).not.toBeNull();
      expect(resolved!.name).toBe('Maria Lopez');
    });

    it('resolves "it" to recent deal', () => {
      const context = contextManager.getContext('C123', 'thread-1');
      contextManager.addEntityReference(context.id, {
        type: 'deal',
        id: 'deal-123',
        name: 'Acme Deal',
        mentionedAt: new Date().toISOString()
      });

      const resolved = contextManager.resolvePronoun(context.id, 'it');
      expect(resolved).not.toBeNull();
      expect(resolved!.name).toBe('Acme Deal');
    });

    it('returns null when no matching entity', () => {
      const context = contextManager.getContext('C123', 'thread-1');
      const resolved = contextManager.resolvePronoun(context.id, 'her');
      expect(resolved).toBeNull();
    });
  });

  describe('buildContextSummary', () => {
    it('builds summary with active agent', () => {
      const context = contextManager.getContext('C123', 'thread-1');
      contextManager.setActiveAgent(context.id, 'hubspot');

      const fullContext = contextManager.getFullContext(context.id)!;
      const summary = contextManager.buildContextSummary(fullContext);

      expect(summary).toContain('hubspot');
    });

    it('builds summary with entities', () => {
      const context = contextManager.getContext('C123', 'thread-1');
      contextManager.addEntityReference(context.id, {
        type: 'contact',
        id: 'contact-123',
        name: 'Maria Lopez',
        mentionedAt: new Date().toISOString()
      });

      const fullContext = contextManager.getFullContext(context.id)!;
      const summary = contextManager.buildContextSummary(fullContext);

      expect(summary).toContain('Maria Lopez');
    });

    it('builds summary with conversation history', () => {
      const context = contextManager.getContext('C123', 'thread-1');
      contextManager.addUserMessage(context.id, 'Add Maria Lopez');
      contextManager.addAssistantMessage(context.id, 'Added Maria Lopez');

      const fullContext = contextManager.getFullContext(context.id)!;
      const summary = contextManager.buildContextSummary(fullContext);

      expect(summary).toContain('Add Maria Lopez');
    });
  });

  describe('cleanup', () => {
    it('removes expired contexts', async () => {
      // Create a context normally
      const context = contextManager.getContext('C999', 'thread-cleanup');

      // Manually set the context to be expired by updating the database directly
      const pastTime = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1 hour ago
      db.prepare(`
        UPDATE conversation_contexts
        SET expires_at = ?
        WHERE id = ?
      `).run(pastTime, context.id);

      const cleaned = contextManager.cleanup();
      expect(cleaned).toBeGreaterThan(0);

      // Context should be gone - getting it again should create a new one
      const newContext = contextManager.getContext('C999', 'thread-cleanup');
      expect(newContext.id).not.toBe(context.id);
    });
  });
});
