@AGENTS.md

## Build & Test

- `npm test` — run all unit tests (vitest)
- `npx vitest run packages/core/tests/unit/` — unit tests only
- `npx vitest run packages/core/tests/integration/` — integration tests (hits real URLs, slow)
- `npm run build` — TypeScript compilation
- `npm run db:generate --workspace packages/core` — regenerate Drizzle migrations from schema

## Architecture

OpenClaw plugin ecosystem — **not a website**. The monorepo has:

- `packages/core/` — main plugin: schema, repositories, services, tools, skills
- `packages/store-wegmans/`, `store-weee/`, `store-butcherbox/` — store ordering plugins (computer-use)
- Each plugin has `openclaw.plugin.json`, `src/`, and `skills/` directories

**Stack:** SQLite via Drizzle ORM, better-sqlite3. Tests use in-memory DB via `createTestDb()`.

**Tool pattern:** Every tool is a factory function (`createXxxTool(repo, ...)`) returning `{ name, description, parameters, handler }`. Handlers use `respond(success, data)` callback — not return values.

**Agent-side logic:** Tools like `suggest_meal_plan` and `generate_prep_list` gather context and return instructions — the agent (Claude) does the thinking, not the tool.

## Workflow

- **Specs are source of truth.** Specs live in `specs/`. Update the spec before writing code.
- **Tests before implementation** when possible.
- **PRs under 500 lines.** Break features into multiple PRs. Prefer independent branches off main over stacked diffs.

## Parallel work

Multiple Claude Code sessions work on this repo simultaneously using shared task lists and worktrees.

**Start a session:** `CLAUDE_CODE_TASK_LIST_ID=oc-kitchen claude --worktree <task-name>`

- **Claim before starting.** Check the shared task list. Claim your task before working on it.
- **One package per agent.** Stay in your package (`packages/core`, `packages/store-wegmans`, etc.). Don't edit files another agent owns.
- **Shared files need coordination.** Root `package.json`, `CLAUDE.md`, `specs/shared/data-model.md` — ask the user before editing.
- **Push and PR when done.** Each worktree produces a branch. Push it, open a PR. Keep PRs under 500 lines and independent from other agents' branches.
- **Tests must pass.** Run `npm test` in your worktree before marking a task complete.

## Conventions

- All IDs are nanoid-generated text primary keys
- All timestamps are ISO 8601 strings
- Tags stored as JSON arrays in text columns
- Verdict system: `banger`, `make_again`, `try_again_with_tweaks`, `dont_make_again` — no numeric stars
- Store assignment: proteins → ButcherBox (if subscribed), Asian specialties → Weee!, everything else → Wegmans
- Recipes auto-tagged on create/import: duration tags (quick/weeknight/project) + equipment tags matched against user profile
