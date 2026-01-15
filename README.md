# Palantir Content Agent

A conversational AI agent for managing blog posts, LinkedIn content, and approvals using natural language interaction.

## Features

- **Agentic Architecture**: Powered by Vercel AI SDK with OpenAI GPT-4o
- **Natural Language Interaction**: No command syntax — just chat like a peer
- **Tool-Calling System**: LLM autonomously decides which operations to perform
- **Slack Integration**: Direct messages with draft creation, approvals, and workflow management
- **Persistent Storage**: JSON-based storage for drafts, interviews, and topics

## Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure environment variables** in `.env`:
   ```
   SLACK_BOT_TOKEN=xoxb-...
   SLACK_APP_TOKEN=xapp-1-...
   SLACK_SIGNING_SECRET=...
   SLACK_CHANNEL=blog
   OPENAI_API_KEY=sk-...
   TAVILY_API_KEY=tvly-...
   ```

   - OpenAI API key: https://platform.openai.com/api-keys
   - Tavily API key (for web search): https://tavily.com/

3. **Initialize storage**:
   ```bash
   npm run dev -- init
   ```

4. **Run the agent**:
   ```bash
   npm run dev -- slack
   ```

## Usage

Direct message the Slack bot in natural language:

- "Let's draft a post about Foundry"
- "Write a blog titled 'AIP Integration' about new features"
- "Show me what drafts we have"
- "This draft looks good to publish"
- "Nah, reject this one because it needs more detail"
- "Save this topic: Data Lake"
- "Quick interview - question: How's AIP going? answer: It's great"

## Commands

```bash
npm run dev -- init          # Initialize storage
npm run dev -- slack          # Start Slack bot
npm run dev -- draft --title "Title" --body "Body" --type linkedin_post
npm run dev -- list          # List all drafts
npm run dev -- approve --id <uuid> [--feedback "..."]
npm run dev -- reject --id <uuid> --feedback "Reason"
npm run dev -- interview --question "Q" --answer "A"
npm run dev -- topic --topic "Topic" [--notes "Notes"]
npm run dev -- snapshot       # Show all data
npm run build                # Build TypeScript
npm run test                 # Run tests
```

## Architecture

- **LLMClient** (`src/llm.ts`): OpenAI GPT-4o with Vercel AI SDK tools
- **ContentAgent** (`src/agent.ts`): Business logic for drafts, interviews, topics
- **SlackBot** (`src/slack.ts`): Bolt-based Slack integration
- **JsonStorage** (`src/storage.ts`): JSON file persistence

## Tool Capabilities (via LLM)

- `createDraft` - Create new content with title, body, type
- `listDrafts` - Show all existing drafts
- `approveDraft` - Mark draft as approved with optional feedback
- `rejectDraft` - Reject draft with reason
- `addInterview` - Store Q&A pair for voice capture
- `addTopic` - Add topic to queue
- `snapshot` - Show all stored data
