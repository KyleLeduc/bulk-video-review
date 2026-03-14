# Worktree Dev Picker Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Update `npm run dev:worktree` so running it from the main workspace can interactively choose one of the existing entries in `./.worktrees/` and start or reuse that worktree's Vite dev server.

**Architecture:** Keep `scripts/worktreeDev.ts` as the single source of truth for worktree discovery, port selection, process inspection, and Vite startup. Add a small target-resolution layer that can enumerate `./.worktrees`, prompt for a selection when the caller is at the workspace root, and then pass the chosen worktree into the existing `runWorktreeDevServer()` path. Preserve current behavior when the command is run from inside a linked worktree.

**Tech Stack:** TypeScript, tsx, Node.js `fs`/`path`/`readline` APIs, Vitest

---

### Task 1: Lock the desired selection behavior in focused tests

**Files:**
- Modify: `scripts/worktreeDev.spec.ts`

**Step 1: Write the failing tests**

Add tests that assert:
- `runWorktreeDevServer()` (or a new pure target-resolution helper) does not prompt when the caller is already inside a linked worktree
- running from the workspace root with one or more directories in `./.worktrees` selects the chosen worktree instead of the root checkout
- an explicit target argument bypasses the interactive picker
- non-interactive execution from the workspace root fails fast with a clear message instead of hanging on stdin
- the picker ignores non-directory entries and sorts candidate worktrees deterministically

**Step 2: Run the focused tests to verify they fail**

Run: `npx vitest run scripts/worktreeDev.spec.ts --exclude .worktrees/**`
Expected: FAIL with missing selection helpers / prompt behavior.

### Task 2: Add pure helpers for enumerating and resolving the target worktree

**Files:**
- Modify: `scripts/worktreeDev.ts`

**Step 1: Add worktree enumeration helpers**

Implement pure helpers for:
- deriving the managed worktree directory: `join(getWorkspaceRoot(currentWorktreeRoot), '.worktrees')`
- listing only direct child directories beneath `./.worktrees`
- resolving a user-supplied target by name (`thumbnail-queue`) or path (`.worktrees/thumbnail-queue`)
- returning a typed result that distinguishes `current`, `explicit`, and `interactive` target resolution paths

**Step 2: Keep the runtime boundary narrow**

Refactor `runWorktreeDevServer()` so it accepts an optional target path and delegates to the new resolution helpers before calling:
- `pickWorktreePort()`
- `resolveViteBin()`
- `spawn(...)`

Do not duplicate the existing Vite startup logic in `scripts/devWorktree.ts`.

**Step 3: Run the focused tests**

Run: `npx vitest run scripts/worktreeDev.spec.ts --exclude .worktrees/**`
Expected: PASS for the new pure resolution behavior.

### Task 3: Add the interactive picker in the CLI entry point

**Files:**
- Modify: `scripts/devWorktree.ts`
- Modify: `scripts/worktreeDev.ts`

**Step 1: Add a minimal prompt flow**

Use Node's built-in `readline/promises` support to:
- show the available `.worktrees/*` candidates when `npm run dev:worktree` is launched from the workspace root with no explicit target
- accept a numeric selection
- allow cancellation with an empty response or Ctrl+C

Recommended UX:
- show worktree name first
- include current server status when available (`already running at http://127.0.0.1:<port>/`)
- include the absolute path for disambiguation

**Step 2: Define safe fallback behavior**

Behavior rules:
- inside a linked worktree: keep current behavior, no prompt
- from the workspace root with no managed worktrees: keep current root behavior or exit with a clear message; choose one rule and lock it in tests
- from the workspace root without a TTY: print a clear error telling the caller to pass a target path or run from inside the worktree
- with an explicit target arg: bypass the prompt and launch that target directly

**Step 3: Run focused verification**

Run:
- `npx vitest run scripts/worktreeDev.spec.ts --exclude .worktrees/**`
- `npm run dev:worktree -- .worktrees/thumbnail-queue`

Expected:
- tests pass
- the explicit-target path starts or reuses the selected worktree server without prompting

### Task 4: Surface the new usage in repo docs

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md`

**Step 1: Update concise usage notes**

Document:
- `npm run dev:worktree` prompts when run from the main workspace and managed worktrees exist
- `npm run dev:worktree -- <name-or-path>` directly targets one worktree
- `npm run dev:status` and `npm run dev:stop` still act on the current worktree context

**Step 2: Run final verification**

Run:
- `npm run lint`
- `npm run type-check`
- `npx vitest run scripts/worktreeDev.spec.ts scripts/worktreeBootstrap.spec.ts --exclude .worktrees/**`

Expected: PASS
