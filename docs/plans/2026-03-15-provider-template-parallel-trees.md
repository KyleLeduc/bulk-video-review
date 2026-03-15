# Provider Template Parallel Trees Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restructure `.template` into a human-facing quick-start template with copy-ready Codex, Claude, and Copilot trees, each bundled with the full non-system skill set and updated repository guidance.

**Architecture:** Keep `.template` as the extraction container inside this repo, but make its contents look like a standalone quick-start template repo. Replace the single shared root tree with provider-specific subtrees, duplicate the shared devcontainer/Structurizr/script assets into each provider tree, and tailor the primary instruction files to each tool’s expected repo layout.

**Tech Stack:** Markdown, Dev Containers, Node.js scripts, Structurizr CLI

---

### Task 1: Update the human-facing template docs

**Files:**
- Modify: `.template/README.md`

**Step 1: Rewrite the README around adoption**

Explain how a human user copies one provider tree into an existing or new repository, what each provider tree contains, and which files should be customized first.

### Task 2: Create provider-specific copy trees

**Files:**
- Create/modify under: `.template/codex/`
- Create/modify under: `.template/claude/`
- Create/modify under: `.template/copilot/`

**Step 1: Duplicate the shared assets**

Each provider tree gets the same `.devcontainer`, `docs/structurizr`, `scripts`, `.gitignore`, and `package.json`.

**Step 2: Tailor the instruction entrypoints**

Use `AGENTS.md` for Codex, `CLAUDE.md` for Claude Code, and `AGENTS.md` plus `.github/copilot-instructions.md` for Copilot.

**Step 3: Bundle the full non-system skill set**

Copy every directory from the source `.config/.codex/skills/` except `.system`, mapping them into each provider’s selected skills location.

### Task 3: Improve the shared repository guidance

**Files:**
- Modify the provider-specific instruction files

**Step 1: Add context-gathering guidance**

Tell agents to inspect repo facts before asking clarifying questions and to prefer repo scripts over ad hoc command invention.

**Step 2: Tighten completion and safety guidance**

Require fresh verification evidence before success claims and keep the instructions short and operational.

### Task 4: Verify provider trees

**Files:**
- Verify each provider tree’s script commands

**Step 1: Run doctor and validation commands**

Run `npm run agent:doctor`, `npm run diagram:doctor`, and `npm run diagram:validate` in each provider tree.

**Step 2: Confirm the bundled skill layout**

Check that all non-system skill directories exist in each provider tree’s expected skill folder.
