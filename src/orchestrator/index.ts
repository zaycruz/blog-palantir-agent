// Main orchestrator - routes messages to appropriate agents

import Database from 'better-sqlite3';
import { LLMClient, LLMConfig } from '../shared/llm.js';
import { ContextManager } from './context.js';
import { IntentClassifier } from './classifier.js';
import { ContentAgent } from '../agents/content/index.js';
import { HubSpotAgent } from '../agents/hubspot/index.js';
import { LinearAgent } from '../agents/linear/index.js';
import {
  AgentType,
  AgentResponse,
  ConversationContext,
  ClassificationResult
} from '../shared/types.js';
import { getUserFriendlyError } from '../shared/errors.js';

export interface OrchestratorConfig {
  llm: LLMConfig;
  context?: {
    historyLength?: number;
    expirationMinutes?: number;
    maxEntitiesPerType?: number;
  };
  classifier?: {
    confidenceThreshold?: number;
    directRouteThreshold?: number;
  };
}

export class Orchestrator {
  private db: Database.Database;
  private llm: LLMClient;
  private contextManager: ContextManager;
  private classifier: IntentClassifier;
  private contentAgent: ContentAgent;
  private hubspotAgent: HubSpotAgent;
  private linearAgent: LinearAgent;

  constructor(db: Database.Database, config: OrchestratorConfig) {
    this.db = db;
    this.llm = new LLMClient(config.llm);
    this.contextManager = new ContextManager(db, config.context);
    this.classifier = new IntentClassifier(this.llm, config.classifier);
    this.contentAgent = new ContentAgent(db, this.llm);
    this.hubspotAgent = new HubSpotAgent(db, this.llm);
    this.linearAgent = new LinearAgent(db, this.llm);
  }

  // Main entry point for handling messages
  async handle(
    message: string,
    channelId: string,
    threadTs?: string,
    userId?: string
  ): Promise<AgentResponse> {
    // Get or create conversation context
    const context = this.contextManager.getContext(channelId, threadTs, userId);

    // Add user message to history
    this.contextManager.addUserMessage(context.id, message);

    try {
      // Classify intent
      const classification = await this.classifyWithContext(message, context);

      // Handle low confidence - ask for clarification
      if (this.classifier.needsClarification(classification)) {
        const response = this.buildClarificationResponse(classification);
        this.contextManager.addAssistantMessage(context.id, response.message);
        return response;
      }

      // Resolve any pronoun references in entities
      const resolvedEntities = this.resolveEntities(classification, context);

      // Route to appropriate agent
      const response = await this.routeToAgent(
        classification.agent,
        message,
        context,
        resolvedEntities
      );

      // Update context with response
      this.contextManager.addAssistantMessage(context.id, response.message, classification.agent);
      this.contextManager.setActiveAgent(context.id, classification.agent);

      // Add any new entity references
      if (response.entities) {
        for (const entity of response.entities) {
          this.contextManager.addEntityReference(context.id, entity);
        }
      }

      return response;
    } catch (error) {
      console.error('Orchestrator error:', error);
      const errorMessage = getUserFriendlyError(error);
      this.contextManager.addAssistantMessage(context.id, errorMessage);
      return { message: errorMessage };
    }
  }

  // Classify with quick patterns first, then LLM
  private async classifyWithContext(
    message: string,
    context: ConversationContext
  ): Promise<ClassificationResult> {
    // Try quick classification first
    const quickResult = this.classifier.quickClassify(message);
    if (quickResult) {
      return quickResult;
    }

    // If continuing same agent conversation, bias toward that agent
    if (context.activeAgent && this.isFollowUp(message)) {
      return {
        agent: context.activeAgent,
        intent: 'Follow-up to previous message',
        confidence: 0.85,
        entities: []
      };
    }

    // Full LLM classification
    return this.classifier.classify(message, context);
  }

  // Check if message looks like a follow-up
  private isFollowUp(message: string): boolean {
    const lower = message.toLowerCase().trim();

    // Short messages or pronoun-heavy messages are often follow-ups
    if (message.length < 50) {
      const followUpIndicators = [
        'also', 'and', 'actually', 'wait', 'oh',
        'yes', 'no', 'ok', 'okay', 'sure',
        'what about', 'how about', 'can you also',
        'he', 'she', 'they', 'it', 'them', 'that', 'this'
      ];

      return followUpIndicators.some(indicator => lower.includes(indicator));
    }

    return false;
  }

  // Resolve entity references using context
  private resolveEntities(
    classification: ClassificationResult,
    context: ConversationContext
  ): ClassificationResult['entities'] {
    // Look for pronoun patterns in the original entities
    return classification.entities.map(entity => {
      // If it's already resolved, return as-is
      if (entity.resolved_id) return entity;

      // Try to resolve pronouns
      const value = entity.value.toLowerCase();
      const pronouns = ['he', 'she', 'him', 'her', 'they', 'them', 'it', 'this', 'that'];

      if (pronouns.includes(value)) {
        const resolved = this.contextManager.resolvePronoun(context.id, value);
        if (resolved) {
          return {
            ...entity,
            resolved_id: resolved.id,
            resolved_name: resolved.name
          };
        }
      }

      return entity;
    });
  }

  // Route to the appropriate agent
  private async routeToAgent(
    agent: AgentType,
    message: string,
    context: ConversationContext,
    entities: ClassificationResult['entities']
  ): Promise<AgentResponse> {
    const history = this.contextManager.getHistoryForLLM(context.id);

    switch (agent) {
      case 'content':
        return this.contentAgent.handle(message, history, entities);

      case 'hubspot':
        return this.hubspotAgent.handle(message, history, entities);

      case 'linear':
        return this.linearAgent.handle(message, history, entities);

      case 'general':
      default:
        return this.handleGeneralQuery(message, history);
    }
  }

  // Handle general queries
  private async handleGeneralQuery(
    message: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<AgentResponse> {
    const systemPrompt = `You are a helpful assistant with three main capabilities:

1. Content Creation (via Content Agent): Create LinkedIn posts, articles, manage drafts, research topics
2. CRM Management (via HubSpot Agent): Manage contacts, companies, deals, tasks, and notes
3. Project Management (via Linear Agent): Manage issues, projects, sprints, and team tasks

For general questions or greetings, respond helpfully. If the user's request is unclear, ask clarifying questions to understand what they need.

Available commands:
- Content: "Write a LinkedIn post about...", "Show my drafts", "Add topic..."
- HubSpot: "Add contact...", "Create deal...", "Log note on...", "Follow up with..."
- Linear: "Create issue...", "My tasks", "Current sprint", "Update issue..."

Be friendly and conversational, but concise.`;

    const response = await this.llm.chat(message, history.map(h => ({
      role: h.role,
      content: h.content
    })), { systemPrompt });

    return { message: response };
  }

  // Build clarification response for low-confidence classifications
  private buildClarificationResponse(classification: ClassificationResult): AgentResponse {
    const suggestions: string[] = [];

    if (classification.agent === 'content' || classification.confidence > 0.3) {
      suggestions.push('Create or edit content (LinkedIn posts, articles)');
    }
    if (classification.agent === 'hubspot' || classification.confidence > 0.3) {
      suggestions.push('Manage CRM (contacts, deals, tasks)');
    }
    suggestions.push('Something else');

    return {
      message: `I'm not sure what you'd like to do. Are you looking to:\n\n${suggestions.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\nCould you tell me more about what you need?`
    };
  }

  // Get context for a channel/thread (for external use)
  getContext(channelId: string, threadTs?: string): ConversationContext | null {
    return this.contextManager.getFullContext(
      this.contextManager.getContext(channelId, threadTs).id
    );
  }

  // Clean up expired contexts
  cleanup(): number {
    return this.contextManager.cleanup();
  }
}

export { ContextManager } from './context.js';
export { IntentClassifier } from './classifier.js';
