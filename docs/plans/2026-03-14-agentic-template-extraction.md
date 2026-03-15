# Agentic Template Extraction Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a reusable `.template` starter repo that extracts the agent-friendly devcontainer setup, Structurizr workflow, and diagram-related agent guidance from this repository.

**Architecture:** Build a self-contained template under `.template` with generalized names and paths. Preserve the original high-value structure (`.devcontainer`, `docs/structurizr`, `scripts`, root workflow files), add inline comments where the file format supports them, and include a validation-first Structurizr script so the template is runnable on its own.

**Tech Stack:** Dev Containers, Node.js 22, Structurizr CLI, Graphviz, Codex CLI

---

### Task 1: Create the template root

**Files:**
- Create: `.template/README.md`
- Create: `.template/package.json`
- Create: `.template/.gitignore`
- Create: `.template/AGENTS.md`

**Step 1: Write the template usage docs**

Describe what was extracted, what is intentionally omitted, and the commands to validate and render Structurizr diagrams.

**Step 2: Create a minimal package manifest**

Add a root `package.json` with only the reusable diagram scripts needed by the template.

**Step 3: Add base ignore rules**

Ignore `node_modules` and other generic local-only files without hiding generated diagrams by default.

**Step 4: Add generalized agent workflow guidance**

Keep only the reusable workflow rules: skill usage, planning, verification, and diagram-specific guidance.

### Task 2: Create the reusable devcontainer

**Files:**
- Create: `.template/.devcontainer/devcontainer.json`
- Create: `.template/.devcontainer/Dockerfile`

**Step 1: Generalize the devcontainer config**

Preserve the working Codex/GitHub auth mounts and VS Code extensions, but replace repo-specific names with workspace-derived placeholders.

**Step 2: Generalize the Docker image**

Keep the packages and Structurizr CLI installation required for agentic coding and diagram rendering, with comments that explain why each group is present.

### Task 3: Create the Structurizr workflow

**Files:**
- Create: `.template/scripts/generateStructurizrDiagrams.mjs`
- Create: `.template/docs/structurizr/workspace.dsl`

**Step 1: Add a validation-first diagram script**

Support `--validate-only` for DSL validation and the default export/render flow for DOT + PNG output.

**Step 2: Add a generalized starter workspace**

Provide a small C4-style example with system, container, and component views that can be renamed for a new project.

### Task 4: Verify the extracted template

**Files:**
- Verify: `.template/scripts/generateStructurizrDiagrams.mjs`
- Verify: `.template/docs/structurizr/workspace.dsl`

**Step 1: Run validation**

Run `node .template/scripts/generateStructurizrDiagrams.mjs --validate-only` and confirm the template DSL validates successfully.

**Step 2: Run rendering**

Run `node .template/scripts/generateStructurizrDiagrams.mjs` and confirm DOT and PNG diagrams are produced under `.template/docs/structurizr/diagrams`.
