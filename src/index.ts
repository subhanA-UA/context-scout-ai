#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";

type CliOptions = {
  root: string;
  budget: number;
  focus: string[];
  output?: string;
  json: boolean;
  includeTests: boolean;
  maxFileChars: number;
};

type FileBrief = {
  path: string;
  bytes: number;
  score: number;
  reasons: string[];
  excerpt?: string;
};

type RepoBrief = {
  name: string;
  root: string;
  generatedAt: string;
  budget: number;
  estimatedTokens: number;
  focus: string[];
  summary: {
    totalFiles: number;
    selectedFiles: number;
    languages: Record<string, number>;
  };
  commands: string[];
  files: FileBrief[];
};

const TEXT_EXTENSIONS = new Set([
  ".c",
  ".cc",
  ".css",
  ".go",
  ".h",
  ".html",
  ".java",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".py",
  ".rs",
  ".sh",
  ".sql",
  ".svelte",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".vue",
  ".yaml",
  ".yml"
]);

const IMPORTANT_NAMES = new Set([
  "package.json",
  "pyproject.toml",
  "cargo.toml",
  "go.mod",
  "readme.md",
  "next.config.js",
  "vite.config.ts",
  "tsconfig.json",
  "dockerfile",
  "compose.yaml",
  "docker-compose.yml"
]);

const SKIP_DIRS = new Set([
  ".git",
  ".next",
  ".turbo",
  "coverage",
  "dist",
  "build",
  "node_modules",
  "target",
  "vendor"
]);

export function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    root: process.cwd(),
    budget: 8000,
    focus: [],
    json: false,
    includeTests: false,
    maxFileChars: 2400
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }

    if ((arg === "--path" || arg === "-p") && next) {
      options.root = resolve(next);
      index += 1;
      continue;
    }

    if ((arg === "--budget" || arg === "-b") && next) {
      options.budget = Number.parseInt(next, 10);
      index += 1;
      continue;
    }

    if ((arg === "--focus" || arg === "-f") && next) {
      options.focus.push(...next.split(",").map((item) => item.trim()).filter(Boolean));
      index += 1;
      continue;
    }

    if ((arg === "--output" || arg === "-o") && next) {
      options.output = next;
      index += 1;
      continue;
    }

    if (arg === "--json") {
      options.json = true;
      continue;
    }

    if (arg === "--include-tests") {
      options.includeTests = true;
      continue;
    }

    if (arg === "--max-file-chars" && next) {
      options.maxFileChars = Number.parseInt(next, 10);
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!Number.isFinite(options.budget) || options.budget < 1000) {
    throw new Error("--budget must be at least 1000");
  }

  return options;
}

export function createBrief(options: CliOptions): RepoBrief {
  const root = resolve(options.root);
  const files = listFiles(root)
    .filter((file) => isUsefulTextFile(file, options.includeTests))
    .map((path) => scoreFile(root, path, options.focus))
    .sort((left, right) => right.score - left.score || left.path.localeCompare(right.path));

  const selected = selectWithinBudget(files, options.budget, options.maxFileChars);

  return {
    name: basename(root),
    root,
    generatedAt: new Date().toISOString(),
    budget: options.budget,
    estimatedTokens: estimateTokens(renderMarkdownBody(selected, options.focus)),
    focus: options.focus,
    summary: {
      totalFiles: files.length,
      selectedFiles: selected.length,
      languages: countLanguages(files)
    },
    commands: detectCommands(root),
    files: selected
  };
}

export function renderMarkdown(brief: RepoBrief): string {
  const focus = brief.focus.length > 0 ? brief.focus.join(", ") : "general repo understanding";
  const commands = brief.commands.length > 0 ? brief.commands.map((command) => `- \`${command}\``).join("\n") : "- No common commands detected.";
  const languages = Object.entries(brief.summary.languages)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 8)
    .map(([language, count]) => `- ${language}: ${count}`)
    .join("\n");

  return `# Context Scout Brief: ${brief.name}

Generated: ${brief.generatedAt}
Focus: ${focus}
Estimated tokens: ${brief.estimatedTokens} / ${brief.budget}

## Repo Snapshot

- Root: \`${brief.root}\`
- Text files scanned: ${brief.summary.totalFiles}
- Files selected: ${brief.summary.selectedFiles}

## Detected Commands

${commands}

## Language Mix

${languages || "- No language signal detected."}

${renderMarkdownBody(brief.files, brief.focus)}
`;
}

function renderMarkdownBody(files: FileBrief[], focus: string[]): string {
  const focusLine = focus.length > 0 ? `\nFocus terms: ${focus.join(", ")}\n` : "";
  const fileSections = files
    .map((file) => {
      const reasons = file.reasons.map((reason) => `\`${reason}\``).join(", ");
      return `## ${file.path}

Score: ${file.score}  
Why included: ${reasons}

\`\`\`${languageFence(file.path)}
${file.excerpt ?? ""}
\`\`\``;
    })
    .join("\n\n");

  return `${focusLine}
## Ranked Context

${fileSections || "No files selected."}`;
}

function listFiles(root: string): string[] {
  try {
    const output = execFileSync("git", ["-C", root, "ls-files"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    const gitFiles = output.split("\n").filter(Boolean).map((file) => join(root, file));
    if (gitFiles.length > 0) {
      return gitFiles;
    }
  } catch {
    // Fall through to recursive scanning outside git repositories.
  }

  return walk(root);
}

function walk(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) {
      continue;
    }

    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(path));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }

  return files;
}

function isUsefulTextFile(path: string, includeTests: boolean): boolean {
  const normalized = path.toLowerCase();
  if (!includeTests && /(^|\/)(test|tests|__tests__|spec)\//.test(normalized)) {
    return false;
  }

  if (normalized.includes(`${sep}node_modules${sep}`) || normalized.includes(`${sep}.git${sep}`)) {
    return false;
  }

  const name = basename(normalized);
  if (name.includes("lock") || name.endsWith(".map")) {
    return false;
  }

  const extension = extname(normalized);
  return TEXT_EXTENSIONS.has(extension) || IMPORTANT_NAMES.has(name);
}

function scoreFile(root: string, path: string, focus: string[]): FileBrief {
  const rel = relative(root, path);
  const lower = rel.toLowerCase();
  const stats = statSync(path);
  const reasons: string[] = [];
  let score = 0;

  if (IMPORTANT_NAMES.has(basename(lower))) {
    score += 50;
    reasons.push("project config");
  }

  if (/(^|\/)(src|app|lib|server|cli)\//.test(lower)) {
    score += 35;
    reasons.push("core source");
  }

  if (/(readme|architecture|design|overview|roadmap)/.test(lower)) {
    score += 25;
    reasons.push("docs signal");
  }

  if (/(index|main|app|server|cli)\.(ts|tsx|js|py|go|rs)$/.test(lower)) {
    score += 20;
    reasons.push("entrypoint");
  }

  for (const term of focus) {
    if (lower.includes(term.toLowerCase())) {
      score += 18;
      reasons.push(`focus:${term}`);
    }
  }

  if (stats.size < 4000) {
    score += 8;
    reasons.push("compact");
  } else if (stats.size > 50000) {
    score -= 20;
    reasons.push("large");
  }

  return {
    path: rel,
    bytes: stats.size,
    score,
    reasons: reasons.length > 0 ? reasons : ["representative"],
    excerpt: safeRead(path)
  };
}

function safeRead(path: string): string {
  const content = readFileSync(path, "utf8");
  if (content.includes("\u0000")) {
    return "";
  }

  return content;
}

function selectWithinBudget(files: FileBrief[], budget: number, maxFileChars: number): FileBrief[] {
  const selected: FileBrief[] = [];
  let used = 900;

  for (const file of files) {
    const excerpt = trimExcerpt(file.excerpt ?? "", maxFileChars);
    const cost = estimateTokens(excerpt) + 80;
    if (used + cost > budget) {
      continue;
    }

    used += cost;
    selected.push({ ...file, excerpt });
  }

  return selected;
}

function trimExcerpt(content: string, maxChars: number): string {
  const cleaned = content.replace(/\r\n/g, "\n").trim();
  if (cleaned.length <= maxChars) {
    return cleaned;
  }

  const head = cleaned.slice(0, Math.floor(maxChars * 0.7)).trimEnd();
  const tail = cleaned.slice(cleaned.length - Math.floor(maxChars * 0.25)).trimStart();
  return `${head}\n\n/* ... middle trimmed by Context Scout ... */\n\n${tail}`;
}

function detectCommands(root: string): string[] {
  const commands: string[] = [];
  const packagePath = join(root, "package.json");

  if (existsSync(packagePath)) {
    try {
      const pkg = JSON.parse(readFileSync(packagePath, "utf8")) as { scripts?: Record<string, string> };
      for (const key of ["dev", "start", "build", "test", "lint", "check"]) {
        if (pkg.scripts?.[key]) {
          commands.push(`npm run ${key}`);
        }
      }
    } catch {
      // Ignore invalid package files.
    }
  }

  if (existsSync(join(root, "pyproject.toml"))) {
    commands.push("pytest");
  }

  if (existsSync(join(root, "go.mod"))) {
    commands.push("go test ./...");
  }

  if (existsSync(join(root, "Cargo.toml"))) {
    commands.push("cargo test");
  }

  return [...new Set(commands)];
}

function countLanguages(files: FileBrief[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const file of files) {
    const language = languageName(file.path);
    counts[language] = (counts[language] ?? 0) + 1;
  }

  return counts;
}

function languageName(path: string): string {
  const extension = extname(path).toLowerCase();
  const names: Record<string, string> = {
    ".css": "CSS",
    ".go": "Go",
    ".html": "HTML",
    ".js": "JavaScript",
    ".jsx": "JavaScript",
    ".json": "JSON",
    ".md": "Markdown",
    ".py": "Python",
    ".rs": "Rust",
    ".sh": "Shell",
    ".ts": "TypeScript",
    ".tsx": "TypeScript",
    ".yaml": "YAML",
    ".yml": "YAML"
  };

  return names[extension] ?? (extension.replace(".", "").toUpperCase() || "Text");
}

function languageFence(path: string): string {
  const extension = extname(path).toLowerCase();
  const fences: Record<string, string> = {
    ".css": "css",
    ".go": "go",
    ".html": "html",
    ".js": "js",
    ".jsx": "jsx",
    ".json": "json",
    ".md": "md",
    ".py": "py",
    ".rs": "rust",
    ".sh": "bash",
    ".ts": "ts",
    ".tsx": "tsx",
    ".yaml": "yaml",
    ".yml": "yaml"
  };

  return fences[extension] ?? "";
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function printHelp(): void {
  console.log(`Context Scout AI

Generate compact, ranked repository briefs for AI coding agents.

Usage:
  context-scout --path . --budget 8000 --focus auth,api --output CONTEXT.md

Options:
  -p, --path <dir>          Repository path. Defaults to current directory.
  -b, --budget <tokens>     Approximate output token budget. Defaults to 8000.
  -f, --focus <terms>       Comma-separated focus terms for ranking.
  -o, --output <file>       Write output to a file.
      --json                Emit JSON instead of Markdown.
      --include-tests       Include tests in ranked context.
      --max-file-chars <n>  Max excerpt characters per file. Defaults to 2400.
  -h, --help                Show help.
`);
}

function main(): void {
  try {
    const options = parseArgs(process.argv.slice(2));
    const brief = createBrief(options);
    const output = options.json ? `${JSON.stringify(brief, null, 2)}\n` : renderMarkdown(brief);

    if (options.output) {
      const destination = resolve(options.output);
      if (!existsSync(dirname(destination))) {
        throw new Error(`Output directory does not exist: ${dirname(destination)}`);
      }
      writeFileSync(destination, output);
    } else {
      process.stdout.write(output);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`context-scout: ${message}`);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
