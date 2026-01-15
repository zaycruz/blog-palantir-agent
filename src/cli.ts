import "dotenv/config";
import { ContentAgent } from "./agent.js";
import { JsonStorage } from "./storage.js";
import { parseArgs, parseContentType, requireFlag } from "./commands.js";
import { SlackBot } from "./slack.js";

const usage = `Usage:
  npm run dev -- init
  npm run dev -- draft --title "Title" --body "Body" --type linkedin_post
  npm run dev -- list
  npm run dev -- approve --id <draftId> [--feedback "Optional feedback"]
  npm run dev -- reject --id <draftId> --feedback "Reason"
  npm run dev -- interview --question "Q" --answer "A"
  npm run dev -- topic --topic "Topic" [--notes "Notes"]
  npm run dev -- snapshot
  npm run dev -- slack
`;

const args = process.argv.slice(2);

const run = async (): Promise<void> => {
  if (args.length === 0) {
    console.log(usage);
    return;
  }

  const storage = new JsonStorage();
  const agent = new ContentAgent(storage);
  const parsed = parseArgs(args);
  const command = parsed.command;
  const flags = parsed.flags;

  switch (command) {
    case "init": {
      await agent.init();
      console.log(`Initialized store at ${storage.path}`);
      return;
    }
    case "draft": {
      const title = requireFlag(flags, "--title");
      const body = requireFlag(flags, "--body");
      const type = parseContentType(requireFlag(flags, "--type"));
      const draft = await agent.createDraft({ title, body, contentType: type });
      console.log(JSON.stringify(draft, null, 2));
      return;
    }
    case "list": {
      const drafts = await agent.listDrafts();
      console.log(JSON.stringify(drafts, null, 2));
      return;
    }
    case "approve": {
      const id = requireFlag(flags, "--id");
      const feedback = flags["--feedback"];
      const draft = await agent.updateDraftStatus(id, "approved", feedback);
      console.log(JSON.stringify(draft, null, 2));
      return;
    }
    case "reject": {
      const id = requireFlag(flags, "--id");
      const feedback = requireFlag(flags, "--feedback");
      const draft = await agent.updateDraftStatus(id, "rejected", feedback);
      console.log(JSON.stringify(draft, null, 2));
      return;
    }
    case "interview": {
      const question = requireFlag(flags, "--question");
      const answer = requireFlag(flags, "--answer");
      const entry = await agent.addInterview(question, answer);
      console.log(JSON.stringify(entry, null, 2));
      return;
    }
    case "topic": {
      const topic = requireFlag(flags, "--topic");
      const notes = flags["--notes"];
      const entry = await agent.addTopic(topic, notes);
      console.log(JSON.stringify(entry, null, 2));
      return;
    }
    case "snapshot": {
      const data = await agent.snapshot();
      console.log(JSON.stringify(data, null, 2));
      return;
    }
    case "slack": {
      const botToken = process.env.SLACK_BOT_TOKEN;
      const appToken = process.env.SLACK_APP_TOKEN;
      const signingSecret = process.env.SLACK_SIGNING_SECRET;
      if (!botToken || !appToken || !signingSecret) {
        throw new Error("Missing Slack credentials. Set SLACK_BOT_TOKEN, SLACK_APP_TOKEN, SLACK_SIGNING_SECRET.");
      }
      const slack = new SlackBot(agent, {
        botToken,
        appToken,
        signingSecret,
        defaultChannel: process.env.SLACK_CHANNEL
      });
      await slack.start();
      console.log("Slack bot running (Socket Mode).");
      return;
    }
    default: {
      console.log(usage);
      return;
    }
  }
};

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
