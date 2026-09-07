import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createBrief, matchesIgnore, parseArgs, renderMarkdown } from "../dist/index.js";

test("parseArgs reads core options", () => {
  const options = parseArgs(["--path", "/tmp/project", "--budget", "4000", "--focus", "auth,api", "--diff", "main", "--json"]);

  assert.equal(options.root, "/tmp/project");
  assert.equal(options.budget, 4000);
  assert.deepEqual(options.focus, ["auth", "api"]);
  assert.equal(options.diffBase, "main");
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
    ignore: [],
    maxFileChars: 1000
  });

  assert.equal(brief.summary.selectedFiles > 0, true);
  assert.deepEqual(brief.changedFiles, []);
  assert.equal(brief.files.some((file) => file.path === "src/auth.ts"), true);
  assert.equal(brief.commands.includes("npm run test"), true);
});

test("createBrief respects .contextscoutignore and CLI ignore patterns", () => {
  const root = mkdtempSync(join(tmpdir(), "context-scout-ignore-"));
  mkdirSync(join(root, "src"));
  mkdirSync(join(root, "private-notes"));
  writeFileSync(join(root, ".contextscoutignore"), "private-notes/\n*.generated.ts\n");
  writeFileSync(join(root, "src", "index.ts"), "export const ok = true;\n");
  writeFileSync(join(root, "src", "secret.generated.ts"), "export const token = 'nope';\n");
  writeFileSync(join(root, "private-notes", "plan.md"), "private\n");
  writeFileSync(join(root, "src", "skip.ts"), "export const skip = true;\n");

  const brief = createBrief({
    root,
    budget: 3000,
    focus: [],
    json: false,
    includeTests: false,
    ignore: ["src/skip.ts"],
    maxFileChars: 1000
  });

  assert.equal(brief.files.some((file) => file.path === "src/index.ts"), true);
  assert.equal(brief.files.some((file) => file.path.includes("generated")), false);
  assert.equal(brief.files.some((file) => file.path.includes("private-notes")), false);
  assert.equal(brief.files.some((file) => file.path === "src/skip.ts"), false);
});

test("matchesIgnore handles exact, directory, basename, and wildcard patterns", () => {
  assert.equal(matchesIgnore("src/auth.generated.ts", ["*.generated.ts"]), true);
  assert.equal(matchesIgnore("private-notes/plan.md", ["private-notes/"]), true);
  assert.equal(matchesIgnore("src/.env", [".env"]), true);
  assert.equal(matchesIgnore("src/index.ts", ["src/index.ts"]), true);
  assert.equal(matchesIgnore("src/index.ts", ["src/auth.ts"]), false);
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
    changedFiles: ["src/index.ts"],
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
  assert.match(markdown, /Changed Files/);
  assert.match(markdown, /Ranked Context/);
});
