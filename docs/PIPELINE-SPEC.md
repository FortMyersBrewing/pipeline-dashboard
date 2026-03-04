# Pipeline Orchestration Spec
**Version:** 0.1 (DRAFT)
**Last Updated:** 2026-03-03
**Status:** Awaiting Rob's review

---

## Overview

Mission Control pipeline: fully autonomous code quality pipeline orchestrated by AVA (coordinator). Rob creates tasks with specs on the dashboard, hits Start. AVA detects pending tasks, orchestrates the pipeline stages, and updates the dashboard at each step. Rob only intervenes if a task lands in the Review column after 3 failed attempts.

## Architecture

```
Rob creates task → hits Start
        ↓
Dispatcher (bash/launchd, every 30s) detects pending task
        ↓
Notifies AVA via sessions_send
        ↓
AVA (Coordinator) orchestrates:
        ↓
   ┌─────────┐
   │  Scout   │  → sessions_spawn (coder agent, Sonnet)
   │          │  → reads project, writes implementation spec
   │          │  → auto-announces result back to AVA
   └────┬────┘
        ↓
   ┌─────────┐
   │ Builder  │  → sessions_spawn (coder agent, Sonnet)
   │          │  → implements the spec (code changes + commit)
   │          │  → auto-announces result back to AVA
   └────┬────┘
        ↓
   ┌──────────┐
   │Gatekeeper│  → automated (no LLM)
   │          │  → lint, type-check, tests on changed files only
   │          │  → pass/fail based on exit codes
   └────┬────┘
        ↓
   ┌──────────┐
   │ Reviewer  │  → sessions_spawn (qa agent OR codex CLI)
   │          │  → different LLM reviews the diff
   │          │  → APPROVED or REJECTED
   └────┬────┘
        ↓
   ┌─────────┐
   │   QA     │  → sessions_spawn (qa agent)
   │          │  → verifies implementation against spec
   │          │  → APPROVED or REJECTED
   └────┬────┘
        ↓
   Done → merge to main, push, mark complete on dashboard
```

## Trigger Mechanism

**Dispatcher** (`scripts/task-dispatcher.sh`):
- Runs every 30s via launchd (`com.fmbrew.task-dispatcher.plist`)
- Polls `GET /api/tasks/pending` (zero LLM cost)
- When pending task found → sends `sessions_send` to AVA's session (`agent:main:main`)
- Message format: `[DISPATCH] task_id | title | project_path | description`
- Marks task as `assignee: "pipeline"` to prevent double-dispatch

**AVA receives the message** and begins orchestration. AVA does NOT do the work — only spawns agents and reads their results.

## Stage Details

### Stage 1: Scout
- **Agent:** `coder` (Sonnet)
- **Input:** Task title + description + project path
- **What it does:** Reads the project codebase, produces a detailed implementation spec
- **Output:** Spec file at `{project}/.pipeline/specs/{task-id}-v{attempt}.md`
- **Spec contents:** Files to create/modify (exact paths), function signatures, types, acceptance criteria, edge cases
- **Pass/Fail:** Pass if spec file is written. Fail if agent crashes or times out (10 min max)
- **Dashboard update:** AVA updates task status to `scouting`, creates run record

### Stage 2: Builder
- **Agent:** `coder` (Sonnet)
- **Input:** The spec from Scout + project path
- **What it does:** Implements the spec — creates/modifies files, runs checks, commits
- **Working branch:** `task/{task-id}-v{attempt}` (git worktree off main)
- **Output:** Committed code on the working branch
- **Pass/Fail:** Pass if changes committed. Fail if no changes or agent crashes
- **Dashboard update:** AVA updates task status to `building`, creates run record

### Stage 3: Gatekeeper
- **Agent:** None (automated bash script)
- **Input:** The working branch with builder's changes
- **What it does:** Runs lint, type-checks, tests on ONLY the files the builder touched
- **Node projects:** `npx svelte-check`, `npm run check`, `npm test`
- **Python projects:** `ruff check` (new files only), `mypy --follow-imports=silent` (excludes test files), `pytest`
- **Pass/Fail:** Exit code 0 = pass, non-zero = fail
- **On failure:** The gatekeeper output (errors) gets fed back to Scout on retry
- **Dashboard update:** AVA updates task status to `gating`, creates run record

### Stage 4: Reviewer
- **Agent:** `qa` agent (Sonnet) — or Codex CLI (`codex review --base main`) if available
- **Input:** Git diff of changes + the spec
- **What it does:** Reviews code for bugs, security issues, spec compliance
- **Output:** APPROVED or REJECTED with reasons
- **Pass/Fail:** "REJECTED" or "critical"/"blocking" keywords = fail
- **Dashboard update:** AVA updates task status to `reviewing`, creates run record

### Stage 5: QA
- **Agent:** `qa` agent (Sonnet)
- **Input:** The spec + project path
- **What it does:** Verifies each acceptance criterion from the spec
- **Output:** Per-criterion PASS/FAIL + overall APPROVED or REJECTED
- **Pass/Fail:** "REJECTED" = fail
- **Dashboard update:** AVA updates task status to `testing`, creates run record

## Retry Logic (3-Strike Rule)

On any stage failure:
1. Capture the failure output (gatekeeper errors, reviewer rejection, QA failures)
2. Feed the failure back to Scout as `PREVIOUS REJECTION`
3. Scout produces a new spec that addresses the issues
4. Builder implements the new spec in a fresh worktree
5. Pipeline continues from Gatekeeper

After 3 failed attempts:
- Task moves to `review` status (Review column on dashboard)
- Rob gets notified (Slack DM to `D0ADE3LH57S`)
- Rob can add a comment and hit Retry, or Dismiss

## Dashboard Integration

AVA updates the dashboard via HTTP at each stage transition:
- `PATCH /api/tasks/{id}` — update status, current_stage, attempt
- `POST /api/tasks/{id}/runs` — create run record (stage, agent, status, result)
- `POST /api/tasks/{id}/events` — log events (stage_pass, stage_fail, merge, escalation)

The dashboard auto-refreshes every 5s, so Rob sees updates in near real-time.

## What AVA Does vs Doesn't Do

**AVA does:**
- Receive dispatch notifications
- Spawn agents via `sessions_spawn`
- Read auto-announce results
- Decide pass/fail based on result text
- Update dashboard records
- Notify Rob on escalation

**AVA does NOT:**
- Write code
- Run tests
- Do long-running work
- Block while agents run (stays available for Rob)

## Decisions (from Rob's review, 2026-03-03)

1. **Gatekeeper execution:** Spawned agent — AVA must stay responsive. 30s blocking is too long.
2. **Reviewer LLM:** Codex CLI (`codex review --base main`) — different LLM (GPT) for anti-slop.
3. **Branch strategy:** Git worktrees per attempt (same as tw-001 — it worked).
4. **Dashboard "Start" button:** Sets status to `dispatching` (not `in_progress`). AVA sets `in_progress` when she picks it up. If task stays in `dispatching` too long, something's wrong.
5. **Spec storage:** Both — filesystem (`{project}/.pipeline/specs/`) AND dashboard API.
6. **Trigger mechanism:** `sessions_send` from dispatcher to AVA.

## Dashboard Pages Affected

As the pipeline progresses, multiple dashboard views need updates:

### Pipeline page (`/` — main kanban board)
- Task card moves through columns: Backlog → Dispatching → In Progress → Complete (or Review)
- Task card shows current stage (scout/builder/gatekeeper/reviewer/qa)
- **Live Log button** — opens terminal-style panel with SSE stream from `/api/logs/[taskId]`
- Run timeline inside task detail modal shows each stage's run record
- Auto-refreshes every 5s via `invalidateAll()`

### Agents page (`/agents`)
- Shows which agents are currently working/idle
- When pipeline spawns a Scout/Builder/Reviewer/QA agent, it should show as "working" with the task name
- Polls gateway every 5s for live agent status
- Shows runtime, token usage for active agents

### Activity page (`/activity`)
- Chronological feed of all events (stage_pass, stage_fail, merge, escalation)
- Each pipeline stage transition creates an event via `POST /api/tasks/{id}/events`
- Should show in real-time as pipeline progresses

### Pipeline page (`/pipeline`)
- Separate from the kanban — shows pipeline-specific view (stages, attempts, specs)
- Run records displayed per stage with expandable output

### What drives these updates
- **Task status/stage changes** → `PATCH /api/tasks/{id}` → Pipeline kanban + Pipeline page
- **Run records** → `POST /api/tasks/{id}/runs` → Pipeline page + Task detail modal
- **Events** → `POST /api/tasks/{id}/events` → Activity page
- **Agent status** → Gateway polling (existing) → Agents page
- **Live logs** → SSE from `/api/logs/[taskId]` tailing log files → Pipeline kanban Live Log panel

### Log file convention
Pipeline stages write logs to `/tmp/pipeline-{taskId}.log` (or `{project}/.pipeline/logs/{taskId}-v{attempt}-{stage}.log`). The SSE endpoint tails these files for live streaming. Each spawned agent should append to the task's log file so the Live Log panel shows the full picture.

## Dashboard Update Skill

Instead of hardcoding dashboard API calls into scripts or AVA's logic, create an OpenClaw skill that any agent can follow to report its own status.

**Skill name:** `dashboard-update`
**Location:** OpenClaw skills directory

**Skill contents:**
- Dashboard base URL (`http://localhost:5555`)
- API endpoints and methods:
  - `PATCH /api/tasks/{id}` — update task status/stage
  - `POST /api/tasks/{id}/runs` — create/update run records
  - `POST /api/tasks/{id}/events` — log events
- Status values: `dispatching`, `in_progress`, `scouting`, `building`, `gating`, `reviewing`, `testing`, `done`, `failed`, `review`
- Run record format: `{ attempt, stage, agent, status, result }`
- Event format: `{ type, message, agent }`
- Instructions: "When you start working, create a run record with status 'running'. When you finish, update it to 'passed' or 'failed' with your result summary."

**How agents use it:**
- AVA includes in the `sessions_spawn` task prompt: "Follow the dashboard-update skill to report your progress"
- Agent reads the skill, creates its own run record at start, updates it when done
- AVA doesn't need to update the dashboard for individual stages — agents self-report

**What AVA still handles:**
- Task-level status transitions (dispatching → in_progress, or → review on 3 strikes)
- Spawning the next stage agent
- Escalation notifications to Rob

**What agents handle themselves:**
- Creating their own run record (running → passed/failed)
- Posting events (stage_pass, stage_fail)
- Writing result summaries

This keeps dashboard logic in one place (the skill file) and makes it easy to update if the API changes.

## Implementation Plan

### Dashboard changes needed:
- Start button sets status to `dispatching` (new status)
- Add `dispatching` to the pipeline column display (In Progress column)
- Add `dispatching` as a visual state (different color/icon from `in_progress`)

### Dispatcher changes needed:
- Poll for `dispatching` tasks instead of `in_progress`
- Use `sessions_send` to notify AVA instead of spawning agents directly
- Message format includes task ID, title, project path, description

### AVA coordinator logic needed:
- Handle `[DISPATCH]` messages from dispatcher
- For each stage: spawn agent → receive auto-announce → evaluate → next stage or retry
- Update dashboard at each transition
- Gatekeeper runs as spawned agent (not inline)
- Reviewer uses Codex CLI (spawned via agent that has codex access)

### Pipeline pending endpoint change:
- `/api/tasks/pending` returns tasks with `status = 'dispatching'` (not `in_progress`)

## Files to Create/Modify

1. `src/routes/+page.svelte` — Start button sets `dispatching`, column filter includes it
2. `src/routes/api/tasks/pending/+server.ts` — filter on `dispatching` status
3. `scripts/task-dispatcher.sh` — use `sessions_send` to notify AVA
4. AVA's orchestration logic — handle dispatch messages, run pipeline stages
5. Gatekeeper wrapper — make it work as a spawned agent (reads project, runs checks, reports)
6. Reviewer wrapper — spawned agent that runs `codex review --base main`

---

*This spec will be updated as we find problems. No code changes until Rob approves.*
*Rob reviewed and answered open questions 2026-03-03 ~10:23 PM.*
