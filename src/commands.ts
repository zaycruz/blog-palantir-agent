import { ContentType } from "./models.js";

export interface ParsedArgs {
  command: string;
  flags: Record<string, string | undefined>;
}

export const parseArgs = (args: string[]): ParsedArgs => {
  const [command, ...rest] = args;
  const flags: Record<string, string | undefined> = {};

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token?.startsWith("--")) {
      continue;
    }
    const value = rest[index + 1];
    if (!value || value.startsWith("--")) {
      flags[token] = undefined;
      continue;
    }
    flags[token] = value;
    index += 1;
  }

  return {
    command: command ?? "",
    flags
  };
};

export const requireFlag = (flags: Record<string, string | undefined>, flag: string): string => {
  const value = flags[flag];
  if (!value) {
    throw new Error(`Missing required ${flag}`);
  }
  return value;
};

export const parseContentType = (value: string): ContentType => {
  if (value !== "linkedin_post" && value !== "linkedin_article" && value !== "blog_post") {
    throw new Error(`Invalid content type: ${value}`);
  }
  return value;
};
