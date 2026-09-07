# Context Scout AI

Generate compact, ranked repo briefs for AI coding agents.

Built by [Subhan Ahmed](https://github.com/subhanA-UA).

Context Scout AI scans a codebase, ranks the files that matter, and emits a clean Markdown or JSON brief you can paste into Codex, Claude Code, Cursor, Gemini CLI, or any other coding agent.

Part of [AI Devtools Lab](https://subhana-ua.github.io/ai-devtools-lab/), a public hub for small AI developer tools that save real engineering time.

## Why This Exists

AI coding tools are strongest when they get the right context and weakest when they get a messy dump. Today's fastest-moving developer tools are all about agent workflows, token savings, repo memory, and better prompts. Context Scout AI focuses on the smallest useful version of that problem: give your agent a sharp repo briefing in one command.

## What Makes It Different

- No API key, vector database, daemon, or account required.
- Ranks files by project config, entrypoints, core source paths, docs, size, and your focus terms.
- Produces a token-budgeted brief with commands, language mix, and trimmed file excerpts.
- Works inside any git repository, with a recursive fallback for non-git folders.

## Quick Start

```bash
npm install
npm run build
node dist/index.js --path . --budget 8000 --focus cli,agent --output CONTEXT_SCOUT.md
```

After package publishing, the intended command is:

```bash
npx context-scout-ai --path . --focus auth,api --output CONTEXT.md
```

## CLI

```bash
context-scout --path . --budget 8000 --focus auth,api --output CONTEXT.md
```

Options:

- `--path`, `-p`: repository path, defaults to the current directory
- `--budget`, `-b`: approximate output token budget, defaults to `8000`
- `--focus`, `-f`: comma-separated focus terms that boost matching files
- `--output`, `-o`: write output to a file
- `--diff`: boost files changed since a git base branch or ref
- `--json`: emit JSON instead of Markdown
- `--include-tests`: include tests in ranked context
- `--ignore`: comma-separated ignore patterns for generated, private, or noisy files
- `--max-file-chars`: cap each file excerpt, defaults to `2400`

## Ignore Noise

Create a `.contextscoutignore` file when a repo has files that should never appear in an agent brief:

```gitignore
.env
private-notes/
*.generated.ts
fixtures/
```

You can also pass one-off patterns from the CLI:

```bash
context-scout --path . --ignore .env,fixtures/,*.snap --output CONTEXT.md
```

## PR And Diff Briefs

Use `--diff` when you want a coding agent to focus on files changed since a branch or ref:

```bash
context-scout --path . --diff main --output REVIEW_CONTEXT.md
```

Changed files get a ranking boost and appear in their own section, which makes the output better for review, debugging, and follow-up implementation prompts.

## Example Output

```md
# Context Scout Brief: my-app

Focus: auth, api
Estimated tokens: 5200 / 8000

## Detected Commands

- `npm run dev`
- `npm run test`

## Ranked Context

## src/server/auth.ts

Score: 73
Why included: `core source`, `focus:auth`
```

## Best Use Cases

- Starting a new AI coding session on an unfamiliar repo
- Handing compact context to another agent
- Preparing a bug brief before asking for implementation help
- Keeping prompts smaller without losing important files

## Feedback

Found a workflow where this should be smarter? Open a [feedback issue](https://github.com/subhanA-UA/context-scout-ai/issues/new/choose). The roadmap is shaped by real developer use, not guesswork.

## Roadmap

- [x] `.contextscoutignore`
- [x] Git diff mode for PR review briefs
- [ ] Mermaid architecture map
- [ ] Repo health scoring
- [ ] MCP server mode

## License

MIT
