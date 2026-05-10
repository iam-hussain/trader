# Process

How this project is being built, in practice.

## Tooling

- **Claude Code on the web** — the AI pair that scaffolds, refactors, and
  documents. Operates in a controlled sandbox with shell access to the repo.
- **Plan mode first** — every meaningful change starts in Plan mode. A plan
  is written to `~/.claude/plans/<slug>.md`, the user reviews and approves,
  then implementation begins. Approved plans are saved.
- **Subagents in parallel** — long fan-out work (e.g. Phase 2 with ~30 files
  across scrapers, options analytics, indicators, sentiment, web UI) is
  split across non-overlapping agents that run concurrently. The main agent
  writes glue and verifies output.
- **Git worktrees** for isolated experiments (not used yet).

## Branching

- Default branch on the remote: per-feature branches like
  `claude/<slug>-<id>`.
- This repo's working branch: `claude/trading-daily-helper-Xc9QC`.
- Phase commits land directly on the working branch — we are pre-PR. PRs to
  a `main` are added when there's a second contributor.
- No squashing during the build-out — the commit log doubles as a build
  diary.

## Phase workflow

Each phase follows the same steps:

1. **Plan** — Plan mode, written to `~/.claude/plans/`. User approves.
2. **Scaffold** — main agent creates skeleton files; or fan out across
   subagents for large phases.
3. **Wire** — main agent connects services (FastAPI endpoints → API routes →
   web pages), runs typecheck/lint locally if dependencies installed.
4. **Document** — every phase updates `docs/FEATURES.md`, `docs/ROADMAP.md`,
   `docs/PENDING.md`, and the relevant subject doc.
5. **Commit + push** — single commit per phase with a comprehensive message
   describing what landed, what's still pending, and what verification was
   done.

## Why this works

- **Plan files are durable** — they survive context resets. Even when a
  conversation is compressed, `~/.claude/plans/<slug>.md` still describes
  the contract.
- **Parallel agents reduce wall-clock** — Phase 2 fanned out across four
  agents (scrapers, options analytics, indicators+sentiment, web UI) and
  reduced sequential work by roughly 4x with no merge pain because each
  agent owned disjoint paths.
- **Documentation in repo, not chat** — the user can't search a chat
  transcript six weeks later. They can grep `docs/`.

## Operating discipline

- **Read before write** — agents only edit a file after Reading it (Edit tool
  enforces this). Prevents stale-overwrite bugs.
- **No `--no-verify`** — pre-commit hooks run. If they fail, fix the cause,
  don't bypass.
- **No silent retries on broken scrapers** — `ScraperError` is raised loudly.
  The reconciler then drops that source for that snapshot.
- **Confirm before destructive ops** — git reset --hard, rm -rf, dropping
  tables, force pushes — all require explicit user consent in chat.
- **One TodoWrite list per session** — Claude tracks progress visibly. Items
  flip in-progress → completed in real time.

## Conventions

- **Commits**: feat/fix/refactor/docs/test prefix. Body explains the why,
  not the diff.
- **Files**: kebab-case for routes, PascalCase for components, snake_case for
  Python.
- **Comments**: only when WHY is non-obvious. No "// what this does" comments
  — the code says what.
- **Docs**: write so a future contributor reading cold can pick up. No
  shorthand.
- **Numerics in UI**: always `font-mono tabular-nums` so columns align.

## What we don't do

- **Auto-PR-merge.** Even from a green CI. Human reviews the branch.
- **Auto-deploy.** This is a local app. No deploy step.
- **Squash phase commits.** The log is a record of how the project grew.
- **Skip the plan.** Even small changes to architecture-relevant files get a
  one-screen plan before edits.

## Review heuristics (for code review)

When reviewing a phase:
- Does it match the plan? Diff against `~/.claude/plans/<slug>.md`.
- Do the schemas line up? `packages/schemas` is the contract — no field
  should appear in DB, API, and UI without a Zod / Prisma counterpart.
- Are scrapers tolerant? Do they raise `ScraperError` instead of returning
  empty dicts?
- Is the new code reachable? A new module that's never imported is dead.
- Is risk discipline preserved? No new "skip risk check" path. No new
  destructive default.
