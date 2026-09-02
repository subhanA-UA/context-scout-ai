import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createBrief, parseArgs, renderMarkdown } from "../dist/index.js";

test("parseArgs reads core options", () => {
  const options = parseArgs(["--path", "/tmp/project", "--budget", "4000", "--focus", "auth,api", "--json"]);

  assert.equal(options.root, "/tmp/project");
  assert.equal(options.budget, 4000);
  assert.deepEqual(options.focus, ["auth", "api"]);
  assert.equal(options.json, true);
});

test("createBrief ranks focused source files", () => {
  const root = mkdtempSync(join(tmpdir(), "context-scout-"));
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "package.json"), JSON.stringify({ scripts: { test: "node --test" } }));
  writeFileSync(join(root, "src", "auth.ts"), "export function login() { return true; }\n");
  writeFileSync(join(root, "src", "billing.ts"), "export function charge() { return true; }\n");

  const brief = createBrief({
    root,
    budget: 3000,
    focus: ["auth"],
    json: false,
    includeTests: false,
    maxFileChars: 1000
  });

  assert.equal(brief.summary.selectedFiles > 0, true);
  assert.equal(brief.files.some((file) => file.path === "src/auth.ts"), true);
  assert.equal(brief.commands.includes("npm run test"), true);
});

test("renderMarkdown includes the product sections agents need", () => {
  const markdown = renderMarkdown({
    name: "demo",
    root: "/tmp/demo",
    generatedAt: "2026-01-01T00:00:00.000Z",
    budget: 2000,
    estimatedTokens: 100,
    focus: ["api"],
    summary: {
      totalFiles: 1,
      selectedFiles: 1,
      languages: { TypeScript: 1 }
    },
    commands: ["npm run test"],
    files: [
      {
        path: "src/index.ts",
        bytes: 10,
        score: 55,
        reasons: ["core source"],
        excerpt: "export {};"
      }
    ]
  });

  assert.match(markdown, /Context Scout Brief/);
  assert.match(markdown, /Detected Commands/);
  assert.match(markdown, /Ranked Context/);
});

