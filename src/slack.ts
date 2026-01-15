import { App, LogLevel, SayFn } from "@slack/bolt";
import { ContentAgent } from "./agent.js";
import { Draft } from "./models.js";
import { LLMClient } from "./llm.js";
import { isDirectMessage } from "./slack-utils.js";

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
    // Handle app_mention events (when user @mentions the bot in a channel)
    this.app.event('app_mention', async ({ event, say }) => {
      console.log('[app_mention] Triggered:', event.text);
      if (!event.text) {
        return;
      }
      const thread_ts = event.thread_ts || event.ts;
      console.log('[app_mention] Thread context:', {
        thread_ts_from_event: event.thread_ts,
        ts_from_event: event.ts,
        final_thread_ts: thread_ts
      });
      await this.handleMessage(event.text, say, thread_ts);
    });

    // Handle regular messages (DMs and keyword-based triggers)
    this.app.message(async ({ message, say }) => {
      // Ignore bot messages (including own messages) to prevent duplicate responses
      const botId = (message as { bot_id?: string }).bot_id;
      if (botId || message.subtype === 'bot_message') {
        console.log('[message] Ignoring bot message');
        return;
      }

      const channelType = (message as { channel_type?: string }).channel_type;
      const channelId = (message as { channel?: string }).channel;
      const messageText = (message as { text?: string }).text;

      console.log('[message] Received:', {
        channelType,
        channelId,
        text: messageText,
        hasText: !!messageText,
        subtype: (message as { subtype?: string }).subtype,
        botId
      });

      if (message.subtype || !messageText) {
        return;
      }

      const text = messageText.trim();
      const isDirect = isDirectMessage(channelType, channelId);

      console.log('[message] Processing:', {
        isDirect,
        containsAgent: text.toLowerCase().includes("agent")
      });

      if (!isDirect && !text.toLowerCase().includes("agent")) {
        return;
      }

      // For DMs, don't use threading - just reply normally
      // For channels, use thread_ts to keep conversation organized
      let thread_ts: string | undefined;
      if (!isDirect) {
        thread_ts = (message as { thread_ts?: string; ts?: string }).thread_ts || (message as { ts?: string }).ts;
      }
      console.log('[message] Thread context:', {
        isDirect,
        thread_ts_from_message: (message as { thread_ts?: string }).thread_ts,
        ts_from_message: (message as { ts?: string }).ts,
        final_thread_ts: thread_ts
      });
      await this.handleMessage(text, say, thread_ts);
    });

    await this.app.start();
    console.log('[SlackBot] Bot started successfully and is listening for events');
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

  private async postResponse(channel: string | undefined, say: SayFn, text: string): Promise<void> {
    if (channel) {
      await this.app.client.chat.postMessage({
        channel,
        text
      });
      return;
    }

    await say(text);
  }

  private async handleMessage(text: string, say: SayFn, thread_ts?: string): Promise<void> {
    try {
      console.log('[handleMessage] Starting LLM call with text:', text.substring(0, 50) + '...');
      const response = await this.llm.chat(text);
      console.log('[handleMessage] LLM response received, length:', response.length);
      if (thread_ts) {
        console.log('[handleMessage] Sending response in thread:', thread_ts);
        await say({ text: response, thread_ts });
      } else {
        console.log('[handleMessage] thread_ts is undefined, sending response without thread');
        await say(response);
      }
      console.log('[handleMessage] Response sent successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error('[SlackHandler Error]', errorMessage);
      const response = errorMessage.includes('API key')
        ? `Configuration error: ${errorMessage}`
        : `Error: ${errorMessage}`;
      if (thread_ts) {
        await say({ text: response, thread_ts });
      } else {
        await say(response);
      }
    }
  }
}
