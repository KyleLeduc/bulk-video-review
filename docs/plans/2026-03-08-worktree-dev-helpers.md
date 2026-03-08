# Worktree Dev Helpers Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add worktree-aware development helpers that avoid duplicate Vite servers, expose active server status, and stop only the current worktree's server.

**Architecture:** Create a small `scripts/worktreeDev.ts` module that contains pure helpers for identifying Vite processes, choosing a stable port per worktree, and selecting safe stop targets. Keep the CLI behavior in the same file or adjacent script entry points, then expose it through `package.json` scripts so each worktree can self-manage its own dev server.

**Tech Stack:** TypeScript, tsx, Vitest, Node.js `/proc` inspection

---

### Task 1: Lock the worktree-aware behavior in focused tests

**Files:**
- Create: `scripts/worktreeDev.spec.ts`
- Create: `scripts/worktreeDev.ts`

**Step 1: Write the failing test**

Add tests that assert:
- the repository root keeps port `5173`
- nested worktrees derive a stable non-root port
- an occupied preferred port advances to the next free port
- stop target selection only returns Vite processes from the current worktree

**Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/worktreeDev.spec.ts`
Expected: FAIL because the helper module does not exist yet.

**Step 3: Write minimal implementation**

Implement pure helpers for:
- deriving the repository root and worktree id from a cwd
- choosing a stable port with collision avoidance
- filtering Vite processes by cwd
- selecting stop targets from a process list

**Step 4: Run test to verify it passes**

Run: `npx vitest run scripts/worktreeDev.spec.ts`
Expected: PASS

### Task 2: Expose the helpers through npm scripts

**Files:**
- Modify: `package.json`
- Modify: `scripts/multiDev.ts`
- Create: `scripts/devWorktree.ts`
- Create: `scripts/devStatus.ts`
- Create: `scripts/devStop.ts`

**Step 1: Wire CLI commands**

Expose:
- `npm run dev:worktree`
- `npm run dev:status`
- `npm run dev:stop`

Use `tsx` entry points that call the shared helper module.

**Step 2: Run focused verification**

Run:
- `npx vitest run scripts/worktreeDev.spec.ts`
- `npm run dev:status`

Expected: PASS, with `dev:status` printing the active Vite servers and their worktree paths.

### Task 3: Clean up stale worktrees safely

**Files:**
- None

**Step 1: Verify worktree status**

Run:
- `git -C /workspaces/bulk-video-review/.worktrees/defer-ingestion-errors status --short --branch`
- `git -C /workspaces/bulk-video-review/.worktrees/ffmpeg-metadata-flag status --short --branch`

Expected:
- `defer-ingestion-errors` remains dirty and is preserved
- `ffmpeg-metadata-flag` is clean and safe to remove

**Step 2: Remove only clean worktrees**

Run: `git worktree remove /workspaces/bulk-video-review/.worktrees/ffmpeg-metadata-flag`
Expected: PASS

**Step 3: Verify final state**

Run: `git worktree list --porcelain`
Expected: only the main worktree and any still-dirty worktrees remain
