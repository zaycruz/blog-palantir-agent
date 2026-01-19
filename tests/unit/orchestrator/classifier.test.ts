// Unit tests for IntentClassifier

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IntentClassifier } from '../../../src/orchestrator/classifier.js';
import { LLMClient } from '../../../src/shared/llm.js';
import { ConversationContext } from '../../../src/shared/types.js';

// Mock LLM client
const createMockLLM = () => {
  return {
    chat: vi.fn(),
    classifyIntent: vi.fn(),
    extractEntities: vi.fn()
  } as unknown as LLMClient;
};

const createEmptyContext = (): ConversationContext => ({
  id: 'test-context',
  slackChannelId: 'C123',
  userId: 'U123',
  activeAgent: null,
  history: [],
  entities: {
    contacts: [],
    deals: [],
    companies: []
  },
  createdAt: new Date().toISOString(),
  lastActivityAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString()
});

describe('IntentClassifier', () => {
  let classifier: IntentClassifier;
  let mockLLM: ReturnType<typeof createMockLLM>;

  beforeEach(() => {
    mockLLM = createMockLLM();
    classifier = new IntentClassifier(mockLLM as unknown as LLMClient);
  });

  describe('quickClassify', () => {
    it('classifies content creation requests', () => {
      const result = classifier.quickClassify('write a LinkedIn post about AI');
      expect(result).not.toBeNull();
      expect(result!.agent).toBe('content');
      expect(result!.confidence).toBeGreaterThan(0.9);
    });

    it('classifies draft operations', () => {
      const result = classifier.quickClassify('show my drafts');
      expect(result).not.toBeNull();
      expect(result!.agent).toBe('content');
    });

    it('classifies contact creation', () => {
      const result = classifier.quickClassify('add John Smith as a contact');
      expect(result).not.toBeNull();
      expect(result!.agent).toBe('hubspot');
    });

    it('classifies task creation', () => {
      const result = classifier.quickClassify('create a task to follow up');
      expect(result).not.toBeNull();
      expect(result!.agent).toBe('hubspot');
    });

    it('classifies deal operations', () => {
      const result = classifier.quickClassify('show my deals');
      expect(result).not.toBeNull();
      expect(result!.agent).toBe('hubspot');
    });

    it('classifies note logging', () => {
      const result = classifier.quickClassify('log a note that we discussed pricing');
      expect(result).not.toBeNull();
      expect(result!.agent).toBe('hubspot');
    });

    it('classifies greetings as general', () => {
      const result = classifier.quickClassify('hello');
      expect(result).not.toBeNull();
      expect(result!.agent).toBe('general');
    });

    it('classifies help requests as general', () => {
      const result = classifier.quickClassify('help');
      expect(result).not.toBeNull();
      expect(result!.agent).toBe('general');
    });

    it('returns null for ambiguous messages', () => {
      const result = classifier.quickClassify('can you help me with something?');
      expect(result).toBeNull();
    });
  });

  describe('classify with LLM', () => {
    it('calls LLM for complex classification', async () => {
      mockLLM.chat = vi.fn().mockResolvedValue(JSON.stringify({
        agent: 'hubspot',
        intent: 'Create contact with company association',
        confidence: 0.85,
        entities: [
          { type: 'contact', value: 'Maria Lopez' },
          { type: 'company', value: 'TechStartup' }
        ]
      }));

      const result = await classifier.classify(
        'Add Maria Lopez, she is CTO at TechStartup',
        createEmptyContext()
      );

      expect(result.agent).toBe('hubspot');
      expect(result.confidence).toBe(0.85);
      expect(result.entities).toHaveLength(2);
    });

    it('uses context for classification', async () => {
      const context = createEmptyContext();
      context.activeAgent = 'hubspot';
      context.entities.contacts.push({
        type: 'contact',
        id: '123',
        name: 'Maria Lopez',
        mentionedAt: new Date().toISOString()
      });

      mockLLM.chat = vi.fn().mockResolvedValue(JSON.stringify({
        agent: 'hubspot',
        intent: 'Log note on contact',
        confidence: 0.9,
        entities: []
      }));

      const result = await classifier.classify(
        'log a note that we discussed pricing',
        context
      );

      expect(result.agent).toBe('hubspot');
      expect(mockLLM.chat).toHaveBeenCalled();

      // Check that context was included in the prompt
      const callArgs = (mockLLM.chat as any).mock.calls[0][0];
      expect(callArgs).toContain('hubspot');
      expect(callArgs).toContain('Maria Lopez');
    });

    it('falls back to general on parse error', async () => {
      mockLLM.chat = vi.fn().mockResolvedValue('Invalid JSON response');

      const result = await classifier.classify(
        'something unclear',
        createEmptyContext()
      );

      expect(result.agent).toBe('general');
      expect(result.confidence).toBeLessThan(0.5);
    });

    it('falls back to general on LLM error', async () => {
      mockLLM.chat = vi.fn().mockRejectedValue(new Error('API error'));

      const result = await classifier.classify(
        'something unclear',
        createEmptyContext()
      );

      expect(result.agent).toBe('general');
      expect(result.confidence).toBeLessThan(0.5);
    });
  });

  describe('confidence thresholds', () => {
    it('identifies high confidence for direct routing', () => {
      const result = {
        agent: 'hubspot' as const,
        intent: 'Create contact',
        confidence: 0.9,
        entities: []
      };

      expect(classifier.shouldRouteDirectly(result)).toBe(true);
    });

    it('identifies low confidence needing clarification', () => {
      const result = {
        agent: 'general' as const,
        intent: 'Unknown',
        confidence: 0.3,
        entities: []
      };

      expect(classifier.needsClarification(result)).toBe(true);
    });

    it('handles medium confidence', () => {
      const result = {
        agent: 'content' as const,
        intent: 'Maybe content related',
        confidence: 0.6,
        entities: []
      };

      expect(classifier.shouldRouteDirectly(result)).toBe(false);
      expect(classifier.needsClarification(result)).toBe(false);
    });
  });
});
