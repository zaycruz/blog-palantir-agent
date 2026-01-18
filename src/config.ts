// Application configuration

import { LogLevel } from '@slack/bolt';
import { LLMConfig } from './shared/llm.js';

export interface Config {
  slack: {
    botToken: string;
    appToken: string;
    signingSecret: string;
    defaultChannel?: string;
    auditChannel?: string;
    logLevel?: LogLevel;
  };

  llm: LLMConfig;

  hubspot: {
    accessToken?: string;
    portalId?: string;
  };

  content: {
    researchSources: string[];
    checkpointDays: string[];
    checkpointTime: string;
  };

  scheduler: {
    timezone: string;
    enabled: boolean;
  };

  context: {
    historyLength: number;
    expirationMinutes: number;
    maxEntitiesPerType: number;
  };

  database: {
    path: string;
  };

  logging: {
    level: 'error' | 'warn' | 'info' | 'debug';
    file?: string;
  };
}

export const loadConfig = (): Config => {
  return {
    slack: {
      botToken: requireEnv('SLACK_BOT_TOKEN'),
      appToken: requireEnv('SLACK_APP_TOKEN'),
      signingSecret: requireEnv('SLACK_SIGNING_SECRET'),
      defaultChannel: process.env.SLACK_DEFAULT_CHANNEL,
      auditChannel: process.env.SLACK_AUDIT_CHANNEL,
      logLevel: parseLogLevel(process.env.SLACK_LOG_LEVEL)
    },

    llm: {
      provider: (process.env.LLM_PROVIDER as 'openai' | 'anthropic') || 'openai',
      model: process.env.LLM_MODEL || 'gpt-4o',
      maxTokens: parseInt(process.env.LLM_MAX_TOKENS || '4096'),
      temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.7')
    },

    hubspot: {
      accessToken: process.env.HUBSPOT_ACCESS_TOKEN,
      portalId: process.env.HUBSPOT_PORTAL_ID
    },

    content: {
      researchSources: (process.env.CONTENT_RESEARCH_SOURCES || 'palantir,medium,reddit').split(','),
      checkpointDays: (process.env.CONTENT_CHECKPOINT_DAYS || 'tuesday,thursday').split(','),
      checkpointTime: process.env.CONTENT_CHECKPOINT_TIME || '09:00'
    },

    scheduler: {
      timezone: process.env.SCHEDULER_TIMEZONE || 'America/Denver',
      enabled: process.env.SCHEDULER_ENABLED !== 'false'
    },

    context: {
      historyLength: parseInt(process.env.CONTEXT_HISTORY_LENGTH || '10'),
      expirationMinutes: parseInt(process.env.CONTEXT_EXPIRATION_MINUTES || '30'),
      maxEntitiesPerType: parseInt(process.env.CONTEXT_MAX_ENTITIES || '5')
    },

    database: {
      path: process.env.DATABASE_PATH || './data/db/main.sqlite'
    },

    logging: {
      level: (process.env.LOG_LEVEL as Config['logging']['level']) || 'info',
      file: process.env.LOG_FILE
    }
  };
};

const requireEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Required environment variable ${name} is not set`);
  }
  return value;
};

const parseLogLevel = (level?: string): LogLevel | undefined => {
  if (!level) return undefined;

  const levels: Record<string, LogLevel> = {
    'error': LogLevel.ERROR,
    'warn': LogLevel.WARN,
    'info': LogLevel.INFO,
    'debug': LogLevel.DEBUG
  };

  return levels[level.toLowerCase()];
};

export default loadConfig;
