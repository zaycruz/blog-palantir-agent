// Error types and handling for the multi-agent platform

export enum ErrorCategory {
  API_FAILURE = 'api_failure',
  NOT_FOUND = 'not_found',
  AMBIGUOUS = 'ambiguous',
  RATE_LIMIT = 'rate_limit',
  LLM_ERROR = 'llm_error',
  AUTH_FAILURE = 'auth_failure',
  VALIDATION = 'validation',
  UNKNOWN = 'unknown'
}

export interface AgentError {
  category: ErrorCategory;
  message: string;
  userMessage: string;
  retryable: boolean;
  details?: Record<string, unknown>;
}

export class AgentErrorClass extends Error implements AgentError {
  category: ErrorCategory;
  userMessage: string;
  retryable: boolean;
  details?: Record<string, unknown>;

  constructor(error: AgentError) {
    super(error.message);
    this.name = 'AgentError';
    this.category = error.category;
    this.userMessage = error.userMessage;
    this.retryable = error.retryable;
    this.details = error.details;
  }
}

// Error factory functions
export const createApiError = (service: string, statusCode?: number, details?: string): AgentErrorClass => {
  return new AgentErrorClass({
    category: ErrorCategory.API_FAILURE,
    message: `${service} API error${statusCode ? ` (${statusCode})` : ''}: ${details || 'Unknown error'}`,
    userMessage: `Couldn't reach ${service} — try again in a minute?`,
    retryable: true,
    details: { service, statusCode, details }
  });
};

export const createNotFoundError = (entityType: string, query: string, suggestions?: string[]): AgentErrorClass => {
  const userMessage = suggestions && suggestions.length > 0
    ? `I found ${suggestions.length} ${entityType}s that might match — which one?\n${suggestions.map(s => `• ${s}`).join('\n')}`
    : `I couldn't find a ${entityType} matching "${query}". Could you be more specific?`;

  return new AgentErrorClass({
    category: ErrorCategory.NOT_FOUND,
    message: `${entityType} not found: ${query}`,
    userMessage,
    retryable: false,
    details: { entityType, query, suggestions }
  });
};

export const createAmbiguousError = (subject: string, context?: string): AgentErrorClass => {
  return new AgentErrorClass({
    category: ErrorCategory.AMBIGUOUS,
    message: `Ambiguous reference: ${subject}`,
    userMessage: context || `${subject} — could you clarify?`,
    retryable: false,
    details: { subject }
  });
};

export const createRateLimitError = (service: string, retryAfterSeconds?: number): AgentErrorClass => {
  const retryText = retryAfterSeconds ? `in ${retryAfterSeconds}s` : 'shortly';
  return new AgentErrorClass({
    category: ErrorCategory.RATE_LIMIT,
    message: `${service} rate limited`,
    userMessage: `${service} is rate limiting — I'll retry ${retryText}`,
    retryable: true,
    details: { service, retryAfterSeconds }
  });
};

export const createLLMError = (details?: string): AgentErrorClass => {
  return new AgentErrorClass({
    category: ErrorCategory.LLM_ERROR,
    message: `LLM error: ${details || 'Unknown'}`,
    userMessage: "I'm having trouble thinking — try again?",
    retryable: true,
    details: { details }
  });
};

export const createAuthError = (service: string): AgentErrorClass => {
  return new AgentErrorClass({
    category: ErrorCategory.AUTH_FAILURE,
    message: `${service} authentication failed`,
    userMessage: `My ${service} connection broke — need to re-auth`,
    retryable: false,
    details: { service }
  });
};

export const createValidationError = (message: string): AgentErrorClass => {
  return new AgentErrorClass({
    category: ErrorCategory.VALIDATION,
    message: `Validation error: ${message}`,
    userMessage: message,
    retryable: false
  });
};

// Error handler for user-facing messages
export const getUserFriendlyError = (error: unknown): string => {
  if (error instanceof AgentErrorClass) {
    return error.userMessage;
  }

  if (error instanceof Error) {
    // Check for common error patterns
    if (error.message.includes('ECONNREFUSED') || error.message.includes('ETIMEDOUT')) {
      return "Couldn't connect to the service — try again in a minute?";
    }
    if (error.message.includes('401') || error.message.includes('Unauthorized')) {
      return "Authentication failed — credentials may need updating.";
    }
    if (error.message.includes('429') || error.message.includes('Too Many Requests')) {
      return "Too many requests — please wait a moment.";
    }
    if (error.message.includes('API key')) {
      return "API key is missing or invalid — please check configuration.";
    }
  }

  return "Something went wrong — please try again.";
};

// Retry helper with exponential backoff
export const withRetry = async <T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    shouldRetry?: (error: unknown) => boolean;
  } = {}
): Promise<T> => {
  const {
    maxAttempts = 3,
    initialDelayMs = 1000,
    maxDelayMs = 10000,
    shouldRetry = (error) => error instanceof AgentErrorClass && error.retryable
  } = options;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxAttempts || !shouldRetry(error)) {
        throw error;
      }

      const delay = Math.min(initialDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
};
