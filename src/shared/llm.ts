// Shared LLM interface for the multi-agent platform

import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { LLMMessage } from "./types.js";
import { createLLMError } from "./errors.js";

export interface LLMConfig {
  provider: 'openai' | 'anthropic';
  model: string;
  maxTokens?: number;
  temperature?: number;
}

export interface ChatOptions {
  systemPrompt: string;
  tools?: Record<string, any>;
  maxSteps?: number;
}

export class LLMClient {
  private config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
  }

  private getModel() {
    if (this.config.provider === 'anthropic') {
      return anthropic(this.config.model);
    }
    return openai(this.config.model);
  }

  async chat(
    message: string,
    history: LLMMessage[] = [],
    options: ChatOptions
  ): Promise<string> {
    const apiKey = this.config.provider === 'anthropic'
      ? process.env.ANTHROPIC_API_KEY
      : process.env.OPENAI_API_KEY;

    if (!apiKey) {
      throw createLLMError(`${this.config.provider} API key not configured`);
    }

    try {
      const messages = [
        ...history.filter(m => m.role !== 'system').map(msg => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content
        })),
        { role: 'user' as const, content: message }
      ];

      const generateOptions: any = {
        model: this.getModel(),
        system: options.systemPrompt,
        messages
      };

      if (options.tools && Object.keys(options.tools).length > 0) {
        generateOptions.tools = options.tools;
        generateOptions.maxSteps = options.maxSteps || 10;
      }

      const { text } = await generateText(generateOptions);
      return text;
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('API key')) {
          throw createLLMError('API key is invalid or missing');
        }
        if (error.message.includes('rate limit')) {
          throw createLLMError('Rate limited, please try again');
        }
      }
      throw createLLMError(error instanceof Error ? error.message : 'Unknown LLM error');
    }
  }

  // Classify intent with confidence score
  async classifyIntent(
    message: string,
    context: string,
    options: string[]
  ): Promise<{ choice: string; confidence: number; reasoning: string }> {
    const systemPrompt = `You are an intent classifier. Given a user message and context, classify the intent into one of the provided options.

Respond in JSON format:
{
  "choice": "the selected option",
  "confidence": 0.0 to 1.0,
  "reasoning": "brief explanation"
}`;

    const userMessage = `Options: ${options.join(', ')}

Context: ${context}

User message: "${message}"

Classify this message.`;

    try {
      const response = await this.chat(userMessage, [], { systemPrompt });

      // Parse JSON response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          choice: parsed.choice || options[0],
          confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
          reasoning: parsed.reasoning || ''
        };
      }

      return { choice: options[0], confidence: 0.5, reasoning: 'Could not parse response' };
    } catch (error) {
      return { choice: options[0], confidence: 0.3, reasoning: 'Classification failed' };
    }
  }

  // Extract entities from a message
  async extractEntities(
    message: string,
    entityTypes: string[]
  ): Promise<Array<{ type: string; value: string; confidence: number }>> {
    const systemPrompt = `You are an entity extractor. Extract entities of the specified types from the user message.

Respond in JSON format:
{
  "entities": [
    { "type": "entity_type", "value": "extracted_value", "confidence": 0.0 to 1.0 }
  ]
}

If no entities found, return { "entities": [] }`;

    const userMessage = `Entity types to extract: ${entityTypes.join(', ')}

Message: "${message}"

Extract all entities.`;

    try {
      const response = await this.chat(userMessage, [], { systemPrompt });

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return parsed.entities || [];
      }

      return [];
    } catch (error) {
      return [];
    }
  }
}

// Create default LLM client
export const createDefaultLLMClient = (): LLMClient => {
  return new LLMClient({
    provider: 'openai',
    model: 'gpt-4o',
    maxTokens: 4096,
    temperature: 0.7
  });
};
