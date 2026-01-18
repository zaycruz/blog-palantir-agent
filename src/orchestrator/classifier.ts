// Intent classifier for the orchestrator

import { LLMClient } from '../shared/llm.js';
import {
  AgentType,
  ClassificationResult,
  ExtractedEntity,
  ConversationContext
} from '../shared/types.js';

export interface ClassifierConfig {
  confidenceThreshold: number;  // Below this, ask for clarification (default: 0.5)
  directRouteThreshold: number; // Above this, route directly (default: 0.8)
}

const DEFAULT_CONFIG: ClassifierConfig = {
  confidenceThreshold: 0.5,
  directRouteThreshold: 0.8
};

const CLASSIFICATION_SYSTEM_PROMPT = `You are an intent classifier for a multi-agent system. Your job is to determine which agent should handle a user's message.

Available agents:
- content: Handles LinkedIn content creation, drafts, research, topics, and writing assistance
- hubspot: Handles CRM operations - contacts, companies, deals, tasks, and notes
- general: For general questions, greetings, or unclear requests

Analyze the message and respond with a JSON object:
{
  "agent": "content" | "hubspot" | "general",
  "intent": "brief description of what the user wants",
  "confidence": 0.0 to 1.0,
  "entities": [
    {
      "type": "contact" | "deal" | "company" | "task" | "date" | "amount",
      "value": "extracted value"
    }
  ]
}

Key patterns:
- "draft", "write", "post", "LinkedIn", "content", "article", "topic" → content
- "contact", "company", "deal", "task", "note", "CRM", "HubSpot", "pipeline", "follow up" → hubspot
- Names with titles like "CTO at Company" → hubspot contact
- Dollar amounts, deal stages → hubspot deal
- Due dates with tasks → hubspot task

Pronouns (he/she/they/it) should NOT be classified as entities - the orchestrator will resolve them from context.

IMPORTANT: Consider conversation context when classifying. If the user is continuing a conversation about CRM, assume they're still talking about HubSpot even without explicit keywords.`;

export class IntentClassifier {
  private llm: LLMClient;
  private config: ClassifierConfig;

  constructor(llm: LLMClient, config?: Partial<ClassifierConfig>) {
    this.llm = llm;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async classify(message: string, context?: ConversationContext): Promise<ClassificationResult> {
    // Build context string for the prompt
    let contextInfo = '';
    if (context) {
      if (context.activeAgent) {
        contextInfo += `Current agent: ${context.activeAgent}\n`;
      }

      const recentEntities: string[] = [];
      for (const contact of context.entities.contacts.slice(-3)) {
        recentEntities.push(`Contact: ${contact.name}`);
      }
      for (const deal of context.entities.deals.slice(-3)) {
        recentEntities.push(`Deal: ${deal.name}`);
      }
      for (const company of context.entities.companies.slice(-3)) {
        recentEntities.push(`Company: ${company.name}`);
      }

      if (recentEntities.length > 0) {
        contextInfo += `Recent entities: ${recentEntities.join(', ')}\n`;
      }

      // Include recent conversation
      const recentTurns = context.history.slice(-4);
      if (recentTurns.length > 0) {
        contextInfo += 'Recent conversation:\n';
        for (const turn of recentTurns) {
          const preview = turn.content.substring(0, 100);
          contextInfo += `  ${turn.role}: ${preview}${turn.content.length > 100 ? '...' : ''}\n`;
        }
      }
    }

    const userMessage = contextInfo
      ? `Context:\n${contextInfo}\n\nUser message: "${message}"`
      : `User message: "${message}"`;

    try {
      const response = await this.llm.chat(userMessage, [], {
        systemPrompt: CLASSIFICATION_SYSTEM_PROMPT
      });

      // Parse JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          agent: this.validateAgent(parsed.agent),
          intent: parsed.intent || 'Unknown intent',
          confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
          entities: this.validateEntities(parsed.entities || [])
        };
      }
    } catch (error) {
      console.error('Classification error:', error);
    }

    // Default to general agent on error
    return {
      agent: 'general',
      intent: 'Classification failed',
      confidence: 0.3,
      entities: []
    };
  }

  // Quick classification for common patterns (no LLM call)
  quickClassify(message: string): ClassificationResult | null {
    const lower = message.toLowerCase().trim();

    // Content agent patterns
    const contentPatterns = [
      /^(write|draft|create|edit)\s+(a\s+)?(linkedin|post|article|content)/,
      /^show\s+(my\s+)?drafts?/,
      /^(approve|reject)\s+(draft|this)/,
      /^what.*topics?/,
      /^add\s+topic/
    ];

    for (const pattern of contentPatterns) {
      if (pattern.test(lower)) {
        return {
          agent: 'content',
          intent: 'Content operation',
          confidence: 0.95,
          entities: []
        };
      }
    }

    // HubSpot patterns
    const hubspotPatterns = [
      /^(add|create|update|find|show|list)\s+(a\s+)?(contact|company|deal|task|note)/,
      /^log\s+(a\s+)?note/,
      /^(create|add)\s+.*as\s+a\s+contact/,
      /^follow\s*up\s+(with|on)/,
      /pipeline\s+summary/,
      /show\s+(my\s+)?(deals|tasks|contacts)/
    ];

    for (const pattern of hubspotPatterns) {
      if (pattern.test(lower)) {
        return {
          agent: 'hubspot',
          intent: 'HubSpot operation',
          confidence: 0.95,
          entities: []
        };
      }
    }

    // General patterns
    const generalPatterns = [
      /^(hi|hello|hey|good\s+(morning|afternoon|evening))/,
      /^(thanks|thank\s+you)/,
      /^help$/,
      /^what\s+can\s+you\s+do/
    ];

    for (const pattern of generalPatterns) {
      if (pattern.test(lower)) {
        return {
          agent: 'general',
          intent: 'Greeting or general query',
          confidence: 0.95,
          entities: []
        };
      }
    }

    return null;
  }

  // Check if confidence is high enough for direct routing
  shouldRouteDirectly(result: ClassificationResult): boolean {
    return result.confidence >= this.config.directRouteThreshold;
  }

  // Check if confidence is too low (need clarification)
  needsClarification(result: ClassificationResult): boolean {
    return result.confidence < this.config.confidenceThreshold;
  }

  private validateAgent(agent: string): AgentType {
    if (['content', 'hubspot', 'general'].includes(agent)) {
      return agent as AgentType;
    }
    return 'general';
  }

  private validateEntities(entities: any[]): ExtractedEntity[] {
    if (!Array.isArray(entities)) return [];

    return entities
      .filter(e => e && typeof e === 'object' && e.type && e.value)
      .map(e => ({
        type: e.type,
        value: String(e.value),
        resolved_id: e.resolved_id,
        resolved_name: e.resolved_name
      }));
  }
}
