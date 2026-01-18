// Slack app setup

import { App, LogLevel } from '@slack/bolt';
import { Orchestrator } from '../orchestrator/index.js';
import { SlackMessageHandler } from './handlers.js';

export interface SlackAppConfig {
  botToken: string;
  appToken: string;
  signingSecret: string;
  defaultChannel?: string;
  auditChannel?: string;
  logLevel?: LogLevel;
}

export class SlackApp {
  private app: App;
  private handler: SlackMessageHandler;
  private config: SlackAppConfig;

  constructor(config: SlackAppConfig, orchestrator: Orchestrator) {
    this.config = config;

    this.app = new App({
      token: config.botToken,
      appToken: config.appToken,
      signingSecret: config.signingSecret,
      socketMode: true,
      logLevel: config.logLevel || LogLevel.INFO
    });

    this.handler = new SlackMessageHandler(this.app, orchestrator);
  }

  async start(): Promise<void> {
    // Set up message handlers
    this.handler.setup();

    // Start the app
    await this.app.start();
    console.log('[SlackApp] Bot started successfully');
  }

  async stop(): Promise<void> {
    await this.app.stop();
    console.log('[SlackApp] Bot stopped');
  }

  // Post a message to a channel
  async postMessage(channel: string, text: string, threadTs?: string): Promise<void> {
    await this.app.client.chat.postMessage({
      channel,
      text,
      thread_ts: threadTs
    });
  }

  // Post to the default channel
  async notify(text: string): Promise<void> {
    if (!this.config.defaultChannel) {
      console.warn('[SlackApp] No default channel configured');
      return;
    }
    await this.postMessage(this.config.defaultChannel, text);
  }

  // Post to the audit channel
  async audit(text: string): Promise<void> {
    if (!this.config.auditChannel) {
      return;
    }
    await this.postMessage(this.config.auditChannel, text);
  }

  // Get the underlying Bolt app (for advanced use)
  getBoltApp(): App {
    return this.app;
  }
}
