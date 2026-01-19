// Slack message handlers

import { App } from '@slack/bolt';
import { Orchestrator } from '../orchestrator/index.js';
import { stripBotMention, buildThreadKey } from '../shared/slack.js';

export interface MessageHandlerConfig {
  trackActiveThreads?: boolean;
  auditChannel?: string;
}

export class SlackMessageHandler {
  private activeThreads: Set<string> = new Set();

  constructor(
    private app: App,
    private orchestrator: Orchestrator,
    private config: MessageHandlerConfig = {}
  ) {}

  // Log to audit channel
  private async auditLog(message: string): Promise<void> {
    if (!this.config.auditChannel) {
      console.log('[auditLog] No audit channel configured');
      return;
    }
    
    console.log('[auditLog] Posting to:', this.config.auditChannel);
    const timestamp = new Date().toISOString();
    try {
      await this.app.client.chat.postMessage({
        channel: this.config.auditChannel,
        text: `\`${timestamp}\` ${message}`,
        unfurl_links: false,
        unfurl_media: false
      });
    } catch (error) {
      console.error('[auditLog] Failed to post audit log:', error);
    }
  }

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

    // For channel messages, check if it's a reply in a thread we know about
    // Check both in-memory tracker AND database for persisted thread contexts
    if (threadTs) {
      const isActiveInMemory = this.activeThreads.has(buildThreadKey(channel, threadTs));
      const hasDbContext = await this.hasPersistedContext(channel, threadTs);
      
      if (isActiveInMemory || hasDbContext) {
        // Re-add to active threads if it was only in DB (for faster future lookups)
        if (!isActiveInMemory && hasDbContext) {
          this.activeThreads.add(buildThreadKey(channel, threadTs));
        }
        console.log('[message] Thread reply (active:', isActiveInMemory, ', db:', hasDbContext, '):', {
          channel,
          threadTs,
          text: text.substring(0, 50)
        });
        await this.processMessage(client, channel, threadTs, text, userId);
        return;
      }
    }

    // Otherwise ignore (wait for @mention to start conversation)
  }

  // Check if we have a persisted context for this thread in the database
  private async hasPersistedContext(channel: string, threadTs: string): Promise<boolean> {
    try {
      const context = this.orchestrator.getContext(channel, threadTs);
      return context !== null && context.history.length > 0;
    } catch {
      return false;
    }
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
    const startTime = Date.now();
    
    try {
      console.log('[processMessage] Processing:', { channel, threadTs, textLength: text.length });

      // Log incoming request
      await this.auditLog(`📥 *Request* | User: <@${userId}> | Channel: <#${channel}> | Text: "${text.substring(0, 100)}${text.length > 100 ? '...' : ''}"`);

      // Route through orchestrator
      const response = await this.orchestrator.handle(text, channel, threadTs, userId);

      const duration = Date.now() - startTime;
      console.log('[processMessage] Response length:', response.message.length);
      console.log('[processMessage] Posting to:', { channel, threadTs });

      await client.chat.postMessage({
        channel,
        thread_ts: threadTs,
        text: response.message
      });

      // Log successful response
      await this.auditLog(`📤 *Response* | Duration: ${duration}ms | Length: ${response.message.length} chars | Preview: "${response.message.substring(0, 80)}${response.message.length > 80 ? '...' : ''}"`);

      console.log('[processMessage] Posted successfully');
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error('[processMessage] Error:', error);
      
      // Log error
      await this.auditLog(`❌ *Error* | Duration: ${duration}ms | User: <@${userId}> | Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
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
