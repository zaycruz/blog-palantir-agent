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
    this.app.message(async ({ message, say }) => {
      if (message.subtype || !message.text) {
        return;
      }

      const text = message.text.trim();
      const channelType = (message as { channel_type?: string }).channel_type;
      const channelId = (message as { channel?: string }).channel;
      const isDirect = isDirectMessage(channelType, channelId);

      if (!isDirect && !text.toLowerCase().includes("agent")) {
        return;
      }

      try {
        const response = await this.llm.chat(text);
        await this.postResponse(channelId, say, response);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        await this.postResponse(channelId, say, `Error: ${errorMessage}`);
      }
    });

    await this.app.start();
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
}
