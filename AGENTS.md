# AGENTS.md

Shared instructions for every agent working in this repo (Claude Code, GLM, Codex).
This is the single source of truth; `CLAUDE.md` just points here.

## What this project is

CardQualifier — a local, explainable quality checker for AI character cards
(SillyTavern / Character Card V2 / Tavern formats). Auditable rubric, not a
taste judge. See `README.md` for the rubric rationale. No build step: plain
ESM Node (`.mjs`), a static `index.html`, and `server.mjs` (dev server on
port 4200).

## Working model

We run a three-role loop. Keep to your role unless the user says otherwise.

1. **Claude plans** — turns a request into a design spec + task breakdown
   (written to `docs/superpowers/specs`, `docs/superpowers/plans`, and
   `tasks/plan.md` / `tasks/todo.md`). No implementation in this phase.
2. **GLM / Codex implements** — executes one task at a time against the plan,
   committing task-by-task.
3. **Claude reviews** — reviews the diff for correctness and simplification
   before it lands, then plans the next slice.

Whoever implements: land small, verify before claiming done, one logical
change per commit.

## Verify before you claim done

Run these from the repo root and paste real output — never assert green
without evidence:

- Tests: `node --test test/*.test.mjs`
  (note: the bare directory form `node --test test/` is broken on Node 24 —
  it tries to load `test/` as a module. Use the glob.)
- Single suite: `node --test test/<name>.test.mjs`
- Syntax check a file: `node --check src/<file>.mjs` (and `server.mjs`)
- Dev server: `PORT=4200 node server.mjs`, health at
  `http://127.0.0.1:4200/api/health`

Every `src/*.mjs` module has a matching `test/*.test.mjs`. New behavior needs
a test in the same commit.

## Conventions

- **Branches:** `feat/<slug>` (e.g. `feat/bulk-evaluation`).
- **Commits:** Conventional Commits (`feat:`, `fix:`, `refactor:`, `docs:`,
  `chore:`) — see `git log`. One task per commit.
- **Modules:** ESM only, `.mjs`, small single-purpose files under `src/`.
- **Don't commit:** local sample cards and agent scratch dirs (already in
  `.gitignore`).

## Where things live

- `src/` — scoring, review, and bulk-evaluation modules.
- `test/` — `node --test` suites + `test/fixtures`.
- `docs/superpowers/{specs,plans}` — design specs and implementation plans
  (local only — gitignored so the public repo stays clean; still the shared
  source of truth for agents working in this checkout).
- `tasks/` — local scratch only (gitignored); not shared between agents.
- `server.mjs`, `index.html`, `styles.css` — the local app.

Keep this file short. If a fact lives in the code or README, don't duplicate
it here.
