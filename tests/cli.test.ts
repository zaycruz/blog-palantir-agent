import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = path.join(repoRoot, "src", "cli.ts");
const tsxBin = path.join(repoRoot, "node_modules", ".bin", "tsx");

const runCli = (args: string[], cwd: string) =>
  spawnSync(tsxBin, [cliPath, ...args], {
    cwd,
    encoding: "utf8"
  });

describe("CLI integration", () => {
  it("initializes, creates, and approves a draft", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "content-agent-"));

    const initResult = runCli(["init"], tempDir);
    expect(initResult.status).toBe(0);

    const draftResult = runCli(
      ["draft", "--title", "Hello", "--body", "World", "--type", "linkedin_post"],
      tempDir
    );
    expect(draftResult.status).toBe(0);

    const draft = JSON.parse(draftResult.stdout) as { id: string };

    const approveResult = runCli(["approve", "--id", draft.id], tempDir);
    expect(approveResult.status).toBe(0);

    const snapshotResult = runCli(["snapshot"], tempDir);
    const snapshot = JSON.parse(snapshotResult.stdout) as { drafts: { id: string }[] };

    expect(snapshot.drafts[0]?.id).toBe(draft.id);
  });

  it("rejects invalid content types", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "content-agent-"));

    const result = runCli(
      ["draft", "--title", "Hello", "--body", "World", "--type", "invalid"],
      tempDir
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Invalid content type");
  });
});
