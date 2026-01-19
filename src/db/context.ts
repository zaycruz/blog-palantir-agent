// Conversation context storage

import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { ConversationContext, ConversationTurn, EntityRef, AgentType } from '../shared/types.js';

export interface ContextConfig {
  historyLength: number;      // Max turns to keep (default: 10)
  expirationMinutes: number;  // Context expiration (default: 30)
  maxEntitiesPerType: number; // Max entities per type (default: 5)
}

const DEFAULT_CONFIG: ContextConfig = {
  historyLength: 10,
  expirationMinutes: 30,
  maxEntitiesPerType: 5
};

export class ContextStorage {
  private config: ContextConfig;

  constructor(private db: Database.Database, config: Partial<ContextConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // Get or create context for a channel/thread
  getOrCreate(channelId: string, threadTs?: string, userId?: string): ConversationContext {
    // Try to find existing context
    const existing = this.find(channelId, threadTs);

    if (existing) {
      // Threaded conversations never expire - threads are natural conversation boundaries
      // Only check expiration for non-threaded (DM) contexts
      if (threadTs || !this.isExpired(existing)) {
        // Update last activity
        this.touchActivity(existing.id, !!threadTs);
        return existing;
      }
    }

    // Create new context
    return this.create(channelId, threadTs, userId || 'unknown');
  }

  // Find existing context
  find(channelId: string, threadTs?: string): ConversationContext | null {
    const row = threadTs
      ? this.db.prepare(`
          SELECT * FROM conversation_contexts
          WHERE slack_channel_id = ? AND slack_thread_ts = ?
        `).get(channelId, threadTs) as ContextRow | undefined
      : this.db.prepare(`
          SELECT * FROM conversation_contexts
          WHERE slack_channel_id = ? AND slack_thread_ts IS NULL
        `).get(channelId) as ContextRow | undefined;

    if (!row) return null;

    return this.rowToContext(row);
  }

  // Create new context
  create(channelId: string, threadTs?: string, userId: string = 'unknown'): ConversationContext {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.config.expirationMinutes * 60 * 1000);

    const context: ConversationContext = {
      id: randomUUID(),
      slackChannelId: channelId,
      slackThreadTs: threadTs,
      userId,
      activeAgent: null,
      history: [],
      entities: {
        contacts: [],
        deals: [],
        companies: []
      },
      createdAt: now.toISOString(),
      lastActivityAt: now.toISOString(),
      expiresAt: expiresAt.toISOString()
    };

    this.db.prepare(`
      INSERT INTO conversation_contexts
      (id, slack_channel_id, slack_thread_ts, user_id, active_agent, history, entities, created_at, last_activity_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      context.id,
      context.slackChannelId,
      context.slackThreadTs || null,
      context.userId,
      context.activeAgent,
      JSON.stringify(context.history),
      JSON.stringify(context.entities),
      context.createdAt,
      context.lastActivityAt,
      context.expiresAt
    );

    return context;
  }

  // Add a turn to the context
  addTurn(contextId: string, turn: ConversationTurn): void {
    const context = this.getById(contextId);
    if (!context) return;

    // Add turn
    context.history.push(turn);

    // Trim history if needed
    if (context.history.length > this.config.historyLength) {
      context.history = context.history.slice(-this.config.historyLength);
    }

    // Update
    this.update(context);
  }

  // Set active agent
  setActiveAgent(contextId: string, agent: AgentType | null): void {
    this.db.prepare(`
      UPDATE conversation_contexts
      SET active_agent = ?, last_activity_at = datetime('now')
      WHERE id = ?
    `).run(agent, contextId);
  }

  // Add entity reference
  addEntity(contextId: string, entity: EntityRef): void {
    const context = this.getById(contextId);
    if (!context) return;

    const entityList = context.entities[entity.type === 'task' ? 'contacts' : `${entity.type}s` as keyof typeof context.entities];
    if (!entityList) return;

    // Check if entity already exists
    const existingIndex = entityList.findIndex(e => e.id === entity.id);
    if (existingIndex >= 0) {
      // Update timestamp
      entityList[existingIndex] = entity;
    } else {
      // Add new entity
      entityList.push(entity);

      // Trim if needed
      if (entityList.length > this.config.maxEntitiesPerType) {
        entityList.shift();
      }
    }

    this.update(context);
  }

  // Get the most recently mentioned entity of a type
  getRecentEntity(contextId: string, type: 'contact' | 'deal' | 'company'): EntityRef | null {
    const context = this.getById(contextId);
    if (!context) return null;

    const entityList = context.entities[`${type}s` as keyof typeof context.entities];
    if (!entityList || entityList.length === 0) return null;

    return entityList[entityList.length - 1];
  }

  // Update context
  update(context: ConversationContext): void {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.config.expirationMinutes * 60 * 1000);

    context.lastActivityAt = now.toISOString();
    context.expiresAt = expiresAt.toISOString();

    this.db.prepare(`
      UPDATE conversation_contexts
      SET active_agent = ?, history = ?, entities = ?, last_activity_at = ?, expires_at = ?
      WHERE id = ?
    `).run(
      context.activeAgent,
      JSON.stringify(context.history),
      JSON.stringify(context.entities),
      context.lastActivityAt,
      context.expiresAt,
      context.id
    );
  }

  // Get context by ID
  getById(id: string): ConversationContext | null {
    const row = this.db.prepare('SELECT * FROM conversation_contexts WHERE id = ?').get(id) as ContextRow | undefined;
    if (!row) return null;
    return this.rowToContext(row);
  }

  // Touch last activity time
  touchActivity(contextId: string, isThreaded: boolean = false): void {
    const now = new Date();
    
    if (isThreaded) {
      // Threaded contexts don't expire - just update activity time
      this.db.prepare(`
        UPDATE conversation_contexts
        SET last_activity_at = ?
        WHERE id = ?
      `).run(now.toISOString(), contextId);
    } else {
      // Non-threaded contexts have expiration
      const expiresAt = new Date(now.getTime() + this.config.expirationMinutes * 60 * 1000);
      this.db.prepare(`
        UPDATE conversation_contexts
        SET last_activity_at = ?, expires_at = ?
        WHERE id = ?
      `).run(now.toISOString(), expiresAt.toISOString(), contextId);
    }
  }

  // Check if context is expired
  isExpired(context: ConversationContext): boolean {
    return new Date(context.expiresAt) < new Date();
  }

  // Clean up expired contexts (only non-threaded ones)
  cleanupExpired(): number {
    const now = new Date().toISOString();
    // Only delete contexts that have no thread_ts (DMs/non-threaded) AND are expired
    const result = this.db.prepare(`
      DELETE FROM conversation_contexts 
      WHERE expires_at < ? AND slack_thread_ts IS NULL
    `).run(now);
    return result.changes;
  }

  // Delete context
  delete(contextId: string): void {
    this.db.prepare('DELETE FROM conversation_contexts WHERE id = ?').run(contextId);
  }

  // Convert database row to ConversationContext
  private rowToContext(row: ContextRow): ConversationContext {
    return {
      id: row.id,
      slackChannelId: row.slack_channel_id,
      slackThreadTs: row.slack_thread_ts || undefined,
      userId: row.user_id,
      activeAgent: row.active_agent as AgentType | null,
      history: JSON.parse(row.history),
      entities: JSON.parse(row.entities),
      createdAt: row.created_at,
      lastActivityAt: row.last_activity_at,
      expiresAt: row.expires_at
    };
  }
}

interface ContextRow {
  id: string;
  slack_channel_id: string;
  slack_thread_ts: string | null;
  user_id: string;
  active_agent: string | null;
  history: string;
  entities: string;
  created_at: string;
  last_activity_at: string;
  expires_at: string;
}
