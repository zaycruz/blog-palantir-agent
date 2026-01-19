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

      const result = await generateText(generateOptions);
      
      // The final text response after all tool calls are processed
      if (result.text) {
        return result.text;
      }
      
      // Check if any tools were actually called
      const hasToolCalls = result.steps?.some(step => 
        step.toolCalls && step.toolCalls.length > 0
      );
      
      // If tools were called, collect results and summarize
      if (hasToolCalls && result.steps && result.steps.length > 0) {
        const toolOutputs: string[] = [];
        
        for (const step of result.steps) {
          for (const toolResult of step.toolResults || []) {
            const output = (toolResult as any).result;
            if (output) {
              toolOutputs.push(String(output));
            }
          }
        }
        
        if (toolOutputs.length > 0) {
          // Ask LLM to summarize the tool results in natural language
          const summaryResult = await generateText({
            model: this.getModel(),
            system: `You are a helpful assistant. The user asked a question and tools were used to get data. 
Summarize the results in a natural, conversational way. Be concise and helpful.
Format for Slack: use bullet points, bold important info, keep it scannable.
Never show raw JSON to users.`,
            messages: [
              { role: 'user', content: message },
              { role: 'assistant', content: `I found this data:\n${toolOutputs.join('\n\n')}` },
              { role: 'user', content: 'Please summarize this in a natural, helpful way.' }
            ]
          });
          
          return summaryResult.text || 'I completed the action but could not generate a summary.';
        }
      }
      
      // No tools called and no text - this shouldn't happen but make a simple call
      if (!result.text) {
        const fallbackResult = await generateText({
          model: this.getModel(),
          system: options.systemPrompt,
          messages: [{ role: 'user', content: message }]
        });
        return fallbackResult.text || "I'm not sure how to help with that. Could you rephrase?";
      }
      
      return result.text;
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
