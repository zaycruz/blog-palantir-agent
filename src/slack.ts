import { App, LogLevel } from "@slack/bolt";
import { ContentAgent } from "./agent.js";
import { Draft } from "./models.js";
import { LLMClient } from "./llm.js";

export interface SlackConfig {
  botToken: string;
  appToken: string;
  signingSecret: string;
  defaultChannel?: string;
}

export const formatDraftSummary = (draft: Draft): string => {
  const bodyPreview = draft.body.length > 120 ? `${draft.body.slice(0, 117)}...` : draft.body;
  return `*${draft.title}* (${draft.contentType})\nStatus: ${draft.status}\n${bodyPreview}`;
};

export class SlackBot {
  private app: App;
  private llm: LLMClient;
  private activeThreads: Set<string> = new Set(); // Track threads where bot is engaged

  constructor(private agent: ContentAgent, private config: SlackConfig) {
    this.app = new App({
      token: config.botToken,
      appToken: config.appToken,
      signingSecret: config.signingSecret,
      socketMode: true,
      logLevel: LogLevel.INFO
    });
    this.llm = new LLMClient(agent);
  }

  async start(): Promise<void> {
    // Handle all messages (DMs and thread replies)
    this.app.message(async ({ message, client }) => {
      // Ignore bot messages to prevent loops
      if ((message as any).bot_id || (message as any).subtype) {
        return;
      }

      const text = (message as any).text;
      if (!text) return;

      const channel = message.channel;
      const thread_ts = (message as any).thread_ts;
      const message_ts = (message as any).ts;
      const channelType = (message as any).channel_type;

      // For DMs, always respond
      if (channelType === 'im') {
        console.log('[message] DM received:', { channel, text: text.substring(0, 50) });
        await this.handleMessage(client, channel, thread_ts || message_ts, text);
        return;
      }

      // For channel messages, check if it's a reply in an active thread
      if (thread_ts && this.activeThreads.has(`${channel}:${thread_ts}`)) {
        console.log('[message] Thread reply in active thread:', { channel, thread_ts, text: text.substring(0, 50) });
        await this.handleMessage(client, channel, thread_ts, text);
        return;
      }

      // Otherwise ignore (wait for @mention to start conversation)
    });

    // Handle @mentions in channels - this starts a new conversation
    this.app.event('app_mention', async ({ event, client }) => {
      const text = event.text;
      const channel = event.channel;
      const thread_ts = event.thread_ts || event.ts;

      console.log('[app_mention] Received:', { 
        channel, 
        thread_ts, 
        text: text?.substring(0, 50) 
      });

      // Track this thread as active
      this.activeThreads.add(`${channel}:${thread_ts}`);
      console.log('[app_mention] Thread marked as active:', `${channel}:${thread_ts}`);

      await this.handleMessage(client, channel, thread_ts, text);
    });

    await this.app.start();
    console.log('[SlackBot] Bot started (standard message handlers)');
  }

  private async handleMessage(client: any, channel: string, thread_ts: string, text: string): Promise<void> {
    try {
      // Get conversation history for context
      const replies = await client.conversations.replies({
        channel,
        ts: thread_ts,
        limit: 20
      });

      const history: Array<{ role: "user" | "assistant"; content: string }> = [];
      if (replies.messages) {
        for (const m of replies.messages) {
          const role = m.bot_id ? "assistant" : "user";
          const content = m.text || "";
          if (content) {
            history.push({ role, content });
          }
        }
      }

      console.log('[handleMessage] History:', history.length, 'messages');
      console.log('[handleMessage] Calling LLM...');

      const response = await this.llm.chat(text, history);
      
      console.log('[handleMessage] LLM response length:', response.length);
      console.log('[handleMessage] Posting to:', { channel, thread_ts });

      await client.chat.postMessage({
        channel,
        thread_ts,
        text: response
      });

      console.log('[handleMessage] Posted successfully');
    } catch (error) {
      console.error('[handleMessage] Error:', error);
      try {
        await client.chat.postMessage({
          channel,
          thread_ts,
          text: "Sorry, something went wrong."
        });
      } catch (e) {
        console.error('[handleMessage] Failed to send error message:', e);
      }
    }
  }

  async notifyDraft(draft: Draft): Promise<void> {
    if (!this.config.defaultChannel) {
      return;
    }
    await this.app.client.chat.postMessage({
      channel: this.config.defaultChannel,
      text: formatDraftSummary(draft)
    });
  }
}
