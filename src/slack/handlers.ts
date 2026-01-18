// Slack message handlers

import { App } from '@slack/bolt';
import { Orchestrator } from '../orchestrator/index.js';
import { stripBotMention, buildThreadKey } from '../shared/slack.js';

export interface MessageHandlerConfig {
  trackActiveThreads?: boolean;
}

export class SlackMessageHandler {
  private activeThreads: Set<string> = new Set();

  constructor(
    private app: App,
    private orchestrator: Orchestrator,
    private config: MessageHandlerConfig = {}
  ) {}

  // Set up all message handlers
  setup(): void {
    // Handle all messages (DMs and thread replies)
    this.app.message(async ({ message, client }) => {
      await this.handleMessage(message as any, client);
    });

    // Handle @mentions in channels - this starts a new conversation
    this.app.event('app_mention', async ({ event, client }) => {
      await this.handleMention(event as any, client);
    });
  }

  // Handle regular messages
  private async handleMessage(message: any, client: any): Promise<void> {
    // Ignore bot messages to prevent loops
    if ((message as any).bot_id || (message as any).subtype) {
      return;
    }

    const text = (message as any).text;
    if (!text) return;

    const channel = message.channel;
    const threadTs = (message as any).thread_ts;
    const messageTs = (message as any).ts;
    const channelType = (message as any).channel_type;
    const userId = (message as any).user;

    // For DMs, always respond
    if (channelType === 'im') {
      console.log('[message] DM received:', { channel, text: text.substring(0, 50) });
      await this.processMessage(client, channel, threadTs || messageTs, text, userId);
      return;
    }

    // For channel messages, check if it's a reply in an active thread
    if (threadTs && this.activeThreads.has(buildThreadKey(channel, threadTs))) {
      console.log('[message] Thread reply in active thread:', {
        channel,
        threadTs,
        text: text.substring(0, 50)
      });
      await this.processMessage(client, channel, threadTs, text, userId);
      return;
    }

    // Otherwise ignore (wait for @mention to start conversation)
  }

  // Handle @mentions
  private async handleMention(event: any, client: any): Promise<void> {
    const text = event.text;
    const channel = event.channel;
    const threadTs = event.thread_ts || event.ts;
    const userId = event.user;

    console.log('[app_mention] Received:', {
      channel,
      threadTs,
      text: text?.substring(0, 50)
    });

    // Track this thread as active
    const threadKey = buildThreadKey(channel, threadTs);
    this.activeThreads.add(threadKey);
    console.log('[app_mention] Thread marked as active:', threadKey);

    // Clean the mention from the text
    const cleanedText = stripBotMention(text);

    await this.processMessage(client, channel, threadTs, cleanedText, userId);
  }

  // Process message through orchestrator
  private async processMessage(
    client: any,
    channel: string,
    threadTs: string,
    text: string,
    userId?: string
  ): Promise<void> {
    try {
      console.log('[processMessage] Processing:', { channel, threadTs, textLength: text.length });

      // Route through orchestrator
      const response = await this.orchestrator.handle(text, channel, threadTs, userId);

      console.log('[processMessage] Response length:', response.message.length);
      console.log('[processMessage] Posting to:', { channel, threadTs });

      await client.chat.postMessage({
        channel,
        thread_ts: threadTs,
        text: response.message
      });

      console.log('[processMessage] Posted successfully');
    } catch (error) {
      console.error('[processMessage] Error:', error);
      try {
        await client.chat.postMessage({
          channel,
          thread_ts: threadTs,
          text: "Sorry, something went wrong. Please try again."
        });
      } catch (e) {
        console.error('[processMessage] Failed to send error message:', e);
      }
    }
  }

  // Check if a thread is active
  isThreadActive(channel: string, threadTs: string): boolean {
    return this.activeThreads.has(buildThreadKey(channel, threadTs));
  }

  // Manually mark a thread as active
  markThreadActive(channel: string, threadTs: string): void {
    this.activeThreads.add(buildThreadKey(channel, threadTs));
  }

  // Clear inactive threads (for cleanup)
  clearThread(channel: string, threadTs: string): void {
    this.activeThreads.delete(buildThreadKey(channel, threadTs));
  }
}
