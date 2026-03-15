# Worktree CLI Remove And Interactive Targeting Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a central `worktree remove` command and make interactive `Up` and `Stop` always prompt from the managed worktree list.

**Architecture:** Extend the existing `scripts/worktreeCli/` module rather than adding another wrapper layer. Keep command routing in `core.ts`, default prompt and service behavior in `defaults.ts`, and reuse `scripts/worktreeDev.ts` for worktree discovery and process inspection while adding only the minimum Git remove plumbing needed.

**Tech Stack:** TypeScript, Node.js, Vitest, Git worktree commands, `prompts`

---

### Task 1: Lock the new CLI behavior with tests

**Files:**
- Modify: `scripts/worktreeCli.spec.ts`

**Step 1: Write the failing test**

Add tests for:
- dispatching `worktree remove`
- default help output including `remove`
- interactive `Up`/`Stop` selections carrying a target-prompt flag instead of defaulting silently

**Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/worktreeCli.spec.ts --exclude .worktrees/**`

Expected: failures for missing `remove` support and missing interactive-target-selection behavior.

### Task 2: Implement the minimal CLI changes

**Files:**
- Modify: `scripts/worktreeCli/core.ts`
- Modify: `scripts/worktreeCli/defaults.ts`
- Modify: `scripts/worktreeCli/index.ts`
- Modify: `scripts/worktree.ts`
- Modify: `scripts/devWorktree.ts`
- Modify: `scripts/devStop.ts`

**Step 1: Add the `remove` command**

Route a new `remove` verb through the shared CLI handlers and default services. Keep the public grammar flat and Docker-style.

**Step 2: Make interactive `Up` and `Stop` always choose from the managed worktree list**

When a command came from the bare interactive launcher, mark it so `Up` and `Stop` always open the worktree picker instead of defaulting to the current checkout.

**Step 3: Implement minimal remove behavior**

Stop any running Vite processes for the target worktree, then remove the worktree with Git. Preserve Git’s default safety for dirty worktrees; do not force-delete.

**Step 4: Re-run the targeted test**

Run: `npx vitest run scripts/worktreeCli.spec.ts --exclude .worktrees/**`

Expected: green.

### Task 3: Update help/docs and run verification

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `package.json` only if command surface changes require it

**Step 1: Update help text and docs**

Document `worktree remove` and the interactive selection behavior for `Up` and `Stop`.

**Step 2: Run verification**

Run:
- `npx vitest run scripts/worktreeCli.spec.ts scripts/worktreeDev.spec.ts scripts/worktreeBootstrap.spec.ts --exclude .worktrees/**`
- `npm run lint`
- `npm run type-check`

**Step 3: Manual smoke checks**

Run:
- `npm run worktree -- help`
- `npm run worktree` and verify `Up`/`Stop` prompt through the worktree list
- `npm run worktree -- remove <target>` on a disposable worktree if available
