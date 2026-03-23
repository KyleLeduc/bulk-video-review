# Template Agent Harness Merge Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Merge the verified `template-agent-harness` branch back into `master` while preserving the newer central worktree CLI changes already present on `master`.

**Architecture:** Treat this as an integration task, not a feature redesign. Keep the branch's `.template` provider trees and template docs, preserve `master`'s canonical `npm run worktree` workflow, and only touch overlap where the merge requires reconciliation.

**Tech Stack:** Git, npm scripts, Node.js, Structurizr CLI

---

### Task 1: Capture the verified baseline

**Files:**
- Verify: `.worktrees/template-agent-harness/.template/codex/**`
- Verify: `.worktrees/template-agent-harness/.template/claude/**`
- Verify: `.worktrees/template-agent-harness/.template/copilot/**`

**Step 1: Confirm the worktree is clean**

Run: `git status --short` in `.worktrees/template-agent-harness`
Expected: no output

**Step 2: Run the provider doctor checks**

Run:
- `npm run agent:doctor`
- `npm run diagram:doctor`
- `npm run diagram:validate`

Expected: exit code `0` for each provider tree under `.template/`

**Step 3: Confirm bundled skill trees are populated**

Run:
- `find .config/.codex/skills -mindepth 1 -maxdepth 1 -type d | sort`
- `find .claude/skills -mindepth 1 -maxdepth 1 -type d | sort`
- `find .github/skills -mindepth 1 -maxdepth 1 -type d | sort`

Expected: the same non-system skill directories exist in all three provider trees

### Task 2: Merge onto `master`

**Files:**
- Modify if needed: `README.md`
- Modify if needed: `AGENTS.md`
- Modify if needed: `.gitignore`
- Add: `.template/**`
- Preserve: `package.json`
- Preserve: `scripts/worktree.ts`
- Preserve: `scripts/worktreeCli/**`

**Step 1: Merge `template-agent-harness` into `master`**

Run: `git merge --no-ff template-agent-harness`
Expected: merge completes, or stops only on overlap that needs reconciliation

**Step 2: Resolve overlap in favor of the newer worktree CLI**

If merge stops, preserve `master`'s current `npm run worktree` entrypoint, help text, and wrapper behavior while keeping the new `.template` tree and template-related docs from the branch.

**Step 3: Inspect the post-merge diff**

Run: `git diff --stat HEAD~1..HEAD`
Expected: `.template/**` is present and `master` worktree CLI files remain intact

### Task 3: Verify the merged result on `master`

**Files:**
- Verify: `package.json`
- Verify: `README.md`
- Verify: `.template/**`

**Step 1: Run targeted repository checks**

Run:
- `npm run lint`
- `npm run type-check`
- `npx vitest run scripts --exclude .worktrees/**`

Expected: all exit `0`

**Step 2: Re-run template provider checks from `master`**

Run the same `agent:doctor`, `diagram:doctor`, and `diagram:validate` commands inside:
- `.template/codex`
- `.template/claude`
- `.template/copilot`

Expected: all exit `0`

**Step 3: Record remaining risk**

If any check depends on external tools or environment assumptions, note that explicitly in the handoff instead of claiming the merge is fully validated beyond the commands actually run.
