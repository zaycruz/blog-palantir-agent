import { ContentType } from "./models.js";
import { parseArgs } from "./commands.js";

export type SlackIntent =
  | { type: "help" }
  | { type: "greeting" }
  | { type: "draft"; title: string; body: string; contentType: ContentType }
  | { type: "list" }
  | { type: "approve"; id: string; feedback?: string }
  | { type: "reject"; id: string; feedback: string }
  | { type: "interview"; question: string; answer: string }
  | { type: "topic"; topic: string; notes?: string }
  | { type: "snapshot" }
  | { type: "unknown"; reason: string };

const normalize = (value: string): string => value.replace(/\s+/g, " ").trim();

const extractQuoted = (label: string, text: string): string | undefined => {
  const regex = new RegExp(`${label}\\s*[:=]?\\s*"([^"]+)"`, "i");
  const match = text.match(regex);
  return match?.[1]?.trim();
};

const extractId = (text: string): string | undefined => {
  const match = text.match(/\b[0-9a-f-]{8,}\b/i);
  return match?.[0];
};

const extractBetween = (text: string, startMarker: string, endMarker: string): string | undefined => {
  const startIndex = text.toLowerCase().indexOf(startMarker.toLowerCase());
  if (startIndex === -1) return undefined;

  const afterStart = text.slice(startIndex + startMarker.length);
  const endIndex = afterStart.toLowerCase().indexOf(endMarker.toLowerCase());
  if (endIndex === -1) return undefined;

  return afterStart.slice(0, endIndex).trim();
};

const extractAfter = (text: string, marker: string): string | undefined => {
  const index = text.toLowerCase().indexOf(marker.toLowerCase());
  if (index === -1) return undefined;
  return text.slice(index + marker.length).trim();
};

const parseConversationalDraft = (text: string): SlackIntent | undefined => {
  const lower = text.toLowerCase();

  if (lower.includes("draft") || lower.includes("write") || lower.includes("create") || lower.includes("post") || lower.includes("blog")) {
    const title = extractTitle(text);
    const body = extractBody(text);

    if (title && body) {
      const contentType = extractContentType(text);
      return { type: "draft", title, body, contentType };
    }

    if (title && !body) {
      return { type: "unknown", reason: `Got title "${title}", but what should the content say?` };
    }

    if (body && !title) {
      return { type: "unknown", reason: `Got the content, but what's the title?` };
    }

    return { type: "unknown", reason: "What do you want to write about? Say the topic and I'll help." };
  }

  return undefined;
};

const extractTitle = (text: string): string | undefined => {
  const patterns = [
    /titled?\s+["']?([^"'.!?]+)/i,
    /title:\s*["']?([^"'.!?]+)/i,
    /about\s+["']?([^"'.!?]+?)(?:\s+(?:and|about|to|for|content|body|called|with))/i,
    /on\s+["']?([^"'.!?]+?)(?:\s+(?:and|about|to|for|content|body|called|with))/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }

  if (text.includes("draft") || text.includes("write") || text.includes("blog")) {
    const words = text.split(/\s+/);
    for (let i = 0; i < words.length; i++) {
      if (["draft", "write", "create", "post", "blog"].includes(words[i].toLowerCase()) && words[i + 1]) {
        return words[i + 1].replace(/["'.!?]/g, "").trim();
      }
    }
  }

  return undefined;
};

const extractBody = (text: string): string | undefined => {
  const patterns = [
    /content:\s*["']?([^"']+?)(?:\n|$)/i,
    /body:\s*["']?([^"']+?)(?:\n|$)/i,
    /say:\s*["']?([^"']+?)(?:\n|$)/i,
    /about:\s*["']?([^"']+?)(?:\n|$)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }

  const afterKeywords = text.match(/(?:about|on|for)\s+["']?([^"'.!?]+?)(?:\s+(?:and|about|called|with))?["']?["']?\s+["']?([^"']+)["']?/i);
  if (afterKeywords && afterKeywords.length > 1) {
    return afterKeywords.slice(1).join(" ").trim();
  }

  const sentences = text.match(/["']([^"']+)["']/g);
  if (sentences && sentences.length > 1) {
    return sentences.slice(1).map((s) => s.replace(/["']/g, "")).join(" ");
  }

  return undefined;
};

const extractContentType = (text: string): ContentType => {
  const lower = text.toLowerCase();
  if (lower.includes("linkedin article")) {
    return "linkedin_article";
  }
  if (lower.includes("blog post") || lower.includes("blog")) {
    return "blog_post";
  }
  return "linkedin_post";
};

export const parseSlackInput = (raw: string): SlackIntent => {
  const cleaned = normalize(raw.replace(/<@[^>]+>/g, ""));

  if (cleaned.toLowerCase().startsWith("agent ")) {
    const args = cleaned.replace(/^agent\s+/i, "").split(/\s+/);
    const parsed = parseArgs(args);
    switch (parsed.command) {
      case "help":
        return { type: "help" };
      case "draft": {
        const title = parsed.flags["--title"];
        const body = parsed.flags["--body"];
        const contentType = parsed.flags["--type"] as ContentType | undefined;
        if (!title || !body || !contentType) {
          return { type: "unknown", reason: "Missing required draft fields." };
        }
        return { type: "draft", title, body, contentType };
      }
      case "list":
        return { type: "list" };
      case "approve": {
        const id = parsed.flags["--id"];
        if (!id) {
          return { type: "unknown", reason: "Missing draft id." };
        }
        return { type: "approve", id, feedback: parsed.flags["--feedback"] };
      }
      case "reject": {
        const id = parsed.flags["--id"];
        const feedback = parsed.flags["--feedback"];
        if (!id || !feedback) {
          return { type: "unknown", reason: "Missing draft id or feedback." };
        }
        return { type: "reject", id, feedback };
      }
      case "interview": {
        const question = parsed.flags["--question"];
        const answer = parsed.flags["--answer"];
        if (!question || !answer) {
          return { type: "unknown", reason: "Missing interview fields." };
        }
        return { type: "interview", question, answer };
      }
      case "topic": {
        const topic = parsed.flags["--topic"];
        if (!topic) {
          return { type: "unknown", reason: "Missing topic." };
        }
        return { type: "topic", topic, notes: parsed.flags["--notes"] };
      }
      case "snapshot":
        return { type: "snapshot" };
      default:
        return { type: "unknown", reason: "Unsupported command." };
    }
  }

  const lower = cleaned.toLowerCase();

  if (lower === "help" || lower.includes("what can you do") || lower.includes("help me")) {
    return { type: "help" };
  }

  if (
    lower === "hi" ||
    lower === "hello" ||
    lower === "hey" ||
    lower.startsWith("hi ") ||
    lower.startsWith("hello ") ||
    lower.startsWith("hey ") ||
    lower.includes("are you available") ||
    lower.includes("are you there")
  ) {
    return { type: "greeting" };
  }

  if (lower.includes("list") && (lower.includes("draft") || lower.includes("post"))) {
    return { type: "list" };
  }

  if (lower.includes("snapshot") || lower.includes("show everything") || lower.includes("show all")) {
    return { type: "snapshot" };
  }

  if (lower.includes("approve")) {
    const id = extractId(cleaned);
    if (!id) {
      return { type: "unknown", reason: "Missing draft id to approve. Include the full ID." };
    }
    const feedback = extractQuoted("feedback", cleaned) ?? extractQuoted("because", cleaned) ?? extractQuoted("reason", cleaned);
    return { type: "approve", id, feedback };
  }

  if (lower.includes("reject") || lower.includes("decline")) {
    const id = extractId(cleaned);
    const feedback = extractQuoted("because", cleaned) ?? extractQuoted("feedback", cleaned) ?? extractQuoted("reason", cleaned);
    if (!id) {
      return { type: "unknown", reason: "Need draft id to reject." };
    }
    if (!feedback) {
      return { type: "unknown", reason: "Need a reason for rejection (e.g., 'reject [id] because...')." };
    }
    return { type: "reject", id, feedback };
  }

  if (lower.includes("interview")) {
    const question = extractQuoted("question", cleaned) ?? extractBetween(cleaned, "question:", "answer:");
    const answer = extractQuoted("answer", cleaned) ?? extractAfter(cleaned, "answer:");
    if (!question || !answer) {
      return { type: "unknown", reason: "Need interview question and answer." };
    }
    return { type: "interview", question: question.trim(), answer: answer.trim() };
  }

  if (lower.includes("topic")) {
    const topic = extractQuoted("topic", cleaned) ?? extractAfter(cleaned, "topic:") ?? extractAfter(cleaned, "add topic");
    const notes = extractQuoted("notes", cleaned) ?? extractQuoted("note", cleaned);
    if (!topic || topic.length < 2) {
      return { type: "unknown", reason: "Need a topic." };
    }
    return { type: "topic", topic: topic.trim(), notes };
  }

  const conversationalDraft = parseConversationalDraft(cleaned);
  if (conversationalDraft) {
    return conversationalDraft;
  }

  if (lower.includes("snapshot") || lower.includes("show everything") || lower.includes("show all")) {
    return { type: "snapshot" };
  }

  if (lower.includes("approve")) {
    const id = extractId(cleaned);
    if (!id) {
      return { type: "unknown", reason: "Missing draft id to approve. Include the full ID or say 'approve the latest'." };
    }
    const feedback = extractQuoted("feedback", cleaned) ?? extractQuoted("because", cleaned) ?? extractQuoted("reason", cleaned);
    return { type: "approve", id, feedback };
  }

  if (lower.includes("reject") || lower.includes("decline")) {
    const id = extractId(cleaned);
    const feedback = extractQuoted("because", cleaned) ?? extractQuoted("feedback", cleaned) ?? extractQuoted("reason", cleaned);
    if (!id) {
      return { type: "unknown", reason: "Need draft id to reject." };
    }
    if (!feedback) {
      return { type: "unknown", reason: "Need a reason for rejection (e.g., 'reject [id] because...')." };
    }
    return { type: "reject", id, feedback };
  }

  if (lower.includes("interview")) {
    const question = extractQuoted("question", cleaned) ?? extractBetween(cleaned, "question:", "answer:");
    const answer = extractQuoted("answer", cleaned) ?? extractAfter(cleaned, "answer:");
    if (!question || !answer) {
      return { type: "unknown", reason: "Need interview question and answer. Say 'interview: question: [Q] answer: [A]'." };
    }
    return { type: "interview", question: question.trim(), answer: answer.trim() };
  }

  if (lower.includes("topic")) {
    const topic = extractQuoted("topic", cleaned) ?? extractAfter(cleaned, "topic:") ?? extractAfter(cleaned, "add topic");
    const notes = extractQuoted("notes", cleaned) ?? extractQuoted("note", cleaned);
    if (!topic || topic.length < 2) {
      return { type: "unknown", reason: "Need a topic. Say 'topic: [your topic] notes: [optional notes]'." };
    }
    return { type: "topic", topic: topic.trim(), notes };
  }

  if (lower.includes("create") || lower.includes("write") || lower.includes("make") || lower.includes("draft") || lower.includes("post")) {
    const title = extractQuoted("title", cleaned) ?? extractBetween(cleaned, "title:", "body:") ?? extractBetween(cleaned, "about", "say") ?? extractBetween(cleaned, "about", "content");
    const body = extractQuoted("body", cleaned) ?? extractQuoted("content", cleaned) ?? extractAfter(cleaned, "body:") ?? extractAfter(cleaned, "say:") ?? extractAfter(cleaned, "content:");
    if (!title || title.length < 2 || !body || body.length < 2) {
      return { type: "unknown", reason: "Need title and body. Say 'draft: title: [your title] body: [your content]'." };
    }
    const contentType = extractContentType(cleaned);
    return { type: "draft", title: title.trim(), body: body.trim(), contentType };
  }

  return { type: "unknown", reason: "Unrecognized request." };
};
