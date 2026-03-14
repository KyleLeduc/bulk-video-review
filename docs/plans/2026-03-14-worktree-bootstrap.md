# Worktree Bootstrap Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a repo-supported worktree creation/bootstrap workflow that makes shared `node_modules` and repo-root `.env*` files available inside worktrees, and fix external-worktree Vite resolution.

**Architecture:** Keep the existing dev-server helpers focused on Vite process management and port selection. Add a small bootstrap layer in `scripts/` that can (1) bootstrap the current or specified worktree and (2) wrap `git worktree add` so new worktrees are provisioned immediately. Reuse `worktreeDev.ts` for workspace-root detection so external worktrees resolve the main checkout correctly.

**Tech Stack:** TypeScript, tsx, Vitest, Node.js filesystem/process APIs, git CLI

---

### Task 1: Lock bootstrap behavior in focused tests

**Files:**
- Modify: `scripts/worktreeDev.spec.ts`
- Create: `scripts/worktreeBootstrap.ts`

**Step 1: Write the failing tests**

Add tests that assert:
- a worktree bootstrap creates a relative `node_modules` symlink pointing at the main workspace install
- bootstrap links repo-root `.env*` files into the worktree when they exist in the workspace and are missing in the worktree
- bootstrap does not overwrite an existing non-symlink file in the worktree
- external worktrees resolve Vite from the workspace root when the worktree has no local install
- worktree add argument generation uses a default `.worktrees/<branch-slug>` path and supports explicit paths

**Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/worktreeDev.spec.ts`
Expected: FAIL with missing bootstrap helpers/behaviors.

### Task 2: Implement minimal bootstrap helpers

**Files:**
- Create: `scripts/worktreeBootstrap.ts`
- Modify: `scripts/worktreeDev.ts`

**Step 1: Add pure bootstrap helpers**

Implement helpers for:
- computing bootstrap link targets from a workspace root and worktree root
- discovering repo-root `.env*` files to share
- creating relative symlinks without overwriting existing non-symlink files
- returning a structured bootstrap result for logging

**Step 2: Fix external-worktree Vite fallback**

Update `resolveViteBin()` to check the workspace root `node_modules` directly before failing so external worktrees can still resolve Vite when bootstrapped.

**Step 3: Run focused tests**

Run: `npx vitest run scripts/worktreeDev.spec.ts`
Expected: PASS

### Task 3: Expose creation/bootstrap commands

**Files:**
- Create: `scripts/worktreeAdd.ts`
- Create: `scripts/worktreeBootstrapCli.ts`
- Modify: `package.json`

**Step 1: Add CLI entry points**

Expose:
- `npm run worktree:add -- <branch> [path]`
- `npm run worktree:bootstrap -- [path]`

Command behavior:
- `worktree:add` creates a worktree with `git worktree add`, using `.worktrees/<branch-slug>` by default
- if the branch already exists, add it directly; otherwise create it with `-b`
- after add succeeds, run bootstrap for that worktree
- `worktree:bootstrap` bootstraps the current worktree when no path is given

**Step 2: Run focused verification**

Run:
- `npx vitest run scripts/worktreeDev.spec.ts`
- `npm run worktree:bootstrap -- .worktrees/thumbnail-queue`

Expected:
- tests pass
- bootstrap reports linked or already-correct assets without overwriting files

### Task 4: Bring script tests into a supported verification path

**Files:**
- Modify: `package.json`
- Modify: `vite.config.ts`

**Step 1: Update Vitest invocation/config**

Adjust the unit-test command/config so script tests can run from the repo root without discovering tests inside `.worktrees/`.

**Step 2: Verify**

Run:
- `npm run test:unit -- scripts/worktreeDev.spec.ts`
Expected: PASS or, if the command is broadened, script tests are included without `.worktrees/` duplication.

### Task 5: Document the workflow

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md`

**Step 1: Add concise usage notes**

Document:
- `npm run worktree:add -- <branch>`
- `npm run worktree:bootstrap`
- that bootstrap shares `node_modules` and repo-root `.env*` files by symlink

**Step 2: Final verification**

Run:
- `npx vitest run scripts/worktreeDev.spec.ts`
- `npm run test:unit -- scripts/worktreeDev.spec.ts` or the updated equivalent

Expected: PASS
