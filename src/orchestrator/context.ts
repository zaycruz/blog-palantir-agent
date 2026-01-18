// Orchestrator context management layer

import { ContextStorage, ContextConfig } from '../db/context.js';
import { ConversationContext, ConversationTurn, EntityRef, AgentType } from '../shared/types.js';
import Database from 'better-sqlite3';

export class ContextManager {
  private storage: ContextStorage;

  constructor(db: Database.Database, config?: Partial<ContextConfig>) {
    this.storage = new ContextStorage(db, config);
  }

  // Get or create context for a Slack message
  getContext(channelId: string, threadTs?: string, userId?: string): ConversationContext {
    return this.storage.getOrCreate(channelId, threadTs, userId);
  }

  // Add a user message to context
  addUserMessage(contextId: string, content: string): void {
    const turn: ConversationTurn = {
      role: 'user',
      content,
      timestamp: new Date().toISOString()
    };
    this.storage.addTurn(contextId, turn);
  }

  // Add an assistant response to context
  addAssistantMessage(contextId: string, content: string, agent?: AgentType): void {
    const turn: ConversationTurn = {
      role: 'assistant',
      content,
      timestamp: new Date().toISOString(),
      agent
    };
    this.storage.addTurn(contextId, turn);
  }

  // Set the active agent for a context
  setActiveAgent(contextId: string, agent: AgentType | null): void {
    this.storage.setActiveAgent(contextId, agent);
  }

  // Get the active agent for a context
  getActiveAgent(contextId: string): AgentType | null {
    const context = this.storage.getById(contextId);
    return context?.activeAgent || null;
  }

  // Add an entity reference to context
  addEntityReference(contextId: string, entity: EntityRef): void {
    this.storage.addEntity(contextId, entity);
  }

  // Get the most recent entity of a type
  getRecentEntity(contextId: string, type: 'contact' | 'deal' | 'company'): EntityRef | null {
    return this.storage.getRecentEntity(contextId, type);
  }

  // Get conversation history for LLM
  getHistoryForLLM(contextId: string): Array<{ role: 'user' | 'assistant'; content: string }> {
    const context = this.storage.getById(contextId);
    if (!context) return [];

    return context.history.map(turn => ({
      role: turn.role,
      content: turn.content
    }));
  }

  // Get full context including entities for classification
  getFullContext(contextId: string): ConversationContext | null {
    return this.storage.getById(contextId);
  }

  // Build context summary for classification prompt
  buildContextSummary(context: ConversationContext): string {
    const parts: string[] = [];

    // Active agent
    if (context.activeAgent) {
      parts.push(`Currently talking to: ${context.activeAgent} agent`);
    }

    // Recent entities
    const allEntities = [
      ...context.entities.contacts.map(e => `Contact: ${e.name}`),
      ...context.entities.deals.map(e => `Deal: ${e.name}`),
      ...context.entities.companies.map(e => `Company: ${e.name}`)
    ];

    if (allEntities.length > 0) {
      parts.push(`Recently mentioned: ${allEntities.join(', ')}`);
    }

    // Recent conversation summary
    if (context.history.length > 0) {
      const lastTurns = context.history.slice(-3);
      const turnSummaries = lastTurns.map(t =>
        `${t.role}: ${t.content.substring(0, 100)}${t.content.length > 100 ? '...' : ''}`
      );
      parts.push(`Recent conversation:\n${turnSummaries.join('\n')}`);
    }

    return parts.length > 0 ? parts.join('\n\n') : 'No prior context';
  }

  // Resolve pronoun references using context
  resolvePronoun(contextId: string, pronoun: string): EntityRef | null {
    const context = this.storage.getById(contextId);
    if (!context) return null;

    const pronounLower = pronoun.toLowerCase();

    // "they" could refer to contacts or companies
    if (pronounLower === 'they' || pronounLower === 'them' || pronounLower === 'their') {
      // Check contacts first (more common)
      const contact = this.storage.getRecentEntity(contextId, 'contact');
      if (contact) return contact;

      // Then companies
      const company = this.storage.getRecentEntity(contextId, 'company');
      if (company) return company;
    }

    // "he", "him", "his", "she", "her" refer to contacts
    if (['he', 'him', 'his', 'she', 'her', 'hers'].includes(pronounLower)) {
      return this.storage.getRecentEntity(contextId, 'contact');
    }

    // "it" could be a deal or company
    if (pronounLower === 'it' || pronounLower === 'its') {
      // Check deals first
      const deal = this.storage.getRecentEntity(contextId, 'deal');
      if (deal) return deal;

      // Then companies
      return this.storage.getRecentEntity(contextId, 'company');
    }

    return null;
  }

  // Clean up expired contexts
  cleanup(): number {
    return this.storage.cleanupExpired();
  }
}
