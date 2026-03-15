# Agent Harness Quick-Start Template

This template repo is designed for a human user who wants to add agent-oriented repo guidance, bundled skills, and a Structurizr workflow to either a new codebase or an existing one.

The provider trees are intentionally parallel and copy-ready so you can start with one tool now and adjust independently later if Codex, Claude Code, or Copilot drift in their expected repo layout.

## Choose a tree

- `codex/`: `AGENTS.md`, `.config/.codex/skills/`, provider-specific devcontainer, and the shared Structurizr scripts
- `claude/`: `CLAUDE.md`, `.claude/skills/`, provider-specific devcontainer, and the shared Structurizr scripts
- `copilot/`: `AGENTS.md`, `.github/copilot-instructions.md`, `.github/skills/`, provider-specific devcontainer, and the shared Structurizr scripts

## Using this with an existing repo

1. Pick one provider tree.
2. Copy that tree's contents into the root of your existing repository.
3. Merge the instruction file with any repo guidance you already have instead of overwriting blindly.
4. Replace the placeholders in the orientation file such as `[SKILL:plan]`, `[COMMAND:test-targeted]`, `[DIRS]`, and `[RULES]`.
5. Review the bundled skills and delete any you do not want the agent to use.
6. Run `npm run agent:doctor`, `npm run diagram:doctor`, and `npm run diagram:validate`.
7. Update `docs/structurizr/workspace.dsl` to match your architecture before rendering diagrams.

## Using this for a new repo

1. Pick one provider tree.
2. Copy that tree's contents into the new repository root.
3. Open the repo in the included devcontainer.
4. Fill in the placeholder values in the instruction file before relying on it.
5. Run the doctor scripts and then customize the Structurizr workspace.

## What is bundled

- A reusable devcontainer for agent-assisted development and Structurizr rendering
- A starter Structurizr workspace plus validate/render scripts
- Doctor scripts for environment and diagram prerequisites
- Every non-system skill from the current source skill library, mapped into a provider-specific folder

## What is intentionally not bundled

- Runtime state, auth files, caches, logs, sessions, or memories
- Rendered Structurizr PNG/DOT artifacts
- Repo-specific application code

## Notes

- The Copilot tree uses `.github/skills/` as its primary bundled skill location.
- The Codex tree uses `.config/.codex/skills/` because that matches the current local Codex config layout used for this extraction.
- `docs/structurizr/diagrams/` is ignored inside each provider tree so render output stays local by default.
- The render scripts honor `STRUCTURIZR_WORKSPACE`, `STRUCTURIZR_CLI`, and `DOT_BIN` if you need to override defaults.
