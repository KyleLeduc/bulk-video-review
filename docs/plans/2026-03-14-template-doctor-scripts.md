# Template Doctor Scripts Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add runnable doctor scripts to the `.template` starter so consumers can verify agent harness and Structurizr prerequisites from the command line.

**Architecture:** Keep the feature script-first and self-contained inside `.template`. Add one shared doctor helper module, expose two top-level entrypoints (`agent:doctor` and `diagram:doctor`), update the template docs/conventions, and verify behavior with targeted Vitest coverage from the host repo.

**Tech Stack:** Node.js, npm scripts, Vitest

---

### Task 1: Add failing coverage for doctor behavior

**Files:**
- Create: `scripts/templateDoctor.spec.ts`

**Step 1: Write the failing tests**

Cover required-vs-optional checks, diagram-specific requirements, and agent-harness warnings for missing optional local config directories.

**Step 2: Run the targeted test**

Run: `npx vitest run scripts/templateDoctor.spec.ts --exclude .worktrees/**`
Expected: FAIL because the template doctor helper module does not exist yet.

### Task 2: Add template doctor scripts

**Files:**
- Create: `.template/scripts/doctorHelpers.mjs`
- Create: `.template/scripts/agentDoctor.mjs`
- Create: `.template/scripts/diagramDoctor.mjs`
- Modify: `.template/package.json`

**Step 1: Implement shared doctor logic**

Add a small helper that evaluates command/path checks, prints a report, and exits non-zero only for missing required dependencies.

**Step 2: Implement the two CLI entrypoints**

Expose a diagram-focused doctor and a broader agent harness doctor.

**Step 3: Wire npm scripts**

Add `npm run diagram:doctor` and `npm run agent:doctor`.

### Task 3: Update template guidance

**Files:**
- Modify: `.template/README.md`
- Modify: `.template/AGENTS.md`

**Step 1: Document the new doctor commands**

Explain what each script checks and how it fits into the template workflow.

### Task 4: Verify

**Files:**
- Verify: `scripts/templateDoctor.spec.ts`
- Verify: `.template/scripts/agentDoctor.mjs`
- Verify: `.template/scripts/diagramDoctor.mjs`

**Step 1: Run targeted tests**

Run: `npx vitest run scripts/templateDoctor.spec.ts --exclude .worktrees/**`
Expected: PASS

**Step 2: Run doctor scripts**

Run: `npm run diagram:doctor` and `npm run agent:doctor` from `.template`
Expected: PASS in the current devcontainer, with warnings only for optional local config paths if they are missing.
