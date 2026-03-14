# Repository Guidelines

> Keep this file short, operational, and stable. Put detailed procedures inside skills.

## Purpose

This repository should be changed with a bias toward clarity, minimalism, and maintainability.

Priorities:

1. Preserve correctness
2. Preserve or improve readability
3. Preserve architectural boundaries
4. Minimize code and surface area
5. Avoid unnecessary abstractions, dependencies, and churn

## Mandatory workflow triggers

- If the task is ambiguous, cross-cutting, risky, or likely to touch more than 3 files, use `writing-plans` before editing.
- If the task is primarily debugging, use `systematic-debugging` before changing code.
- If the task changes implementation code, use `verification-before-completion` before handoff.
- If the task introduces or changes abstractions, public contracts, dependency direction, or architectural boundaries, use `requesting-code-review` after implementation.
- If the task requires diagrams, architecture explanation, or impact analysis, use `writing-plans` before editing and use `mcp__mermaid__generate` or `npm run diagram:video` when a rendered diagram is needed.
- Use subagents only for clearly separable, read-heavy work. Avoid parallel write-heavy edits unless explicitly required.

## Safety and git rules

- Never revert, overwrite, or delete unrelated user changes.
- Never use destructive git commands without explicit approval.
- Stop and report if the working tree contains unexpected changes that create risk.
- Prefer the smallest safe change that solves the problem.
- Do not rename, move, or reorganize files unless the task requires it.
- Do not introduce new dependencies, frameworks, or patterns unless justified by the task or approved by the user.

## Worktree workflow

- Create new worktrees with `npm run worktree:add -- <branch> [path]` instead of raw `git worktree add`.
- If entering an existing or manually created worktree, run `npm run worktree:bootstrap -- [path]` before `npm` or dev commands.
- Do not run `npm install` inside a worktree unless you intentionally want a separate local install; the normal path is the shared root `node_modules` symlink plus shared repo-root `.env*` symlinks.
- Inside a worktree, use `npm run dev:worktree`, `npm run dev:status`, and `npm run dev:stop` rather than `npm run dev`.

## Change discipline

Before making non-trivial changes:

- Identify the relevant files, layers, and boundaries.
- Prefer modifying existing code over creating new wrappers, managers, facades, or indirection.
- Preserve established architecture unless the task explicitly calls for structural change.
- Keep the number of touched files as low as practical.
- When a change has meaningful tradeoffs, state them explicitly.

## Code quality standards

### Readability

- Prefer explicit, descriptive names over abbreviations unless the abbreviation is domain-standard.
- Favor boring, obvious code over clever code.
- Write code that a human reviewer can understand quickly.
- Keep control flow shallow and easy to follow.
- Prefer straightforward data flow over hidden behavior.

### Functions and modules

- Functions should do one thing and have a clear reason to change.
- Keep modules cohesive; avoid mixing unrelated responsibilities.
- Split code when a unit has multiple responsibilities or confusing control flow.
- Avoid overly large files unless the existing repo style clearly prefers them.

### Abstractions

Do not introduce abstractions unless at least one of these is true:

- The same behavior is duplicated in 2+ real call sites
- The abstraction represents an existing architectural boundary
- The abstraction materially improves testing, dependency direction, or clarity

Avoid:

- speculative generalization
- one-off interfaces
- unnecessary service/factory/manager layers
- wrappers that only pass through behavior without adding value

## Architecture and boundaries

- Respect existing boundaries between business logic, orchestration, I/O, persistence, transport, and presentation.
- Do not mix concerns across layers.
- Keep policy/business rules separate from framework and I/O details where practical.
- Do not leak transport, storage, or UI concerns into core logic unless that is the established design of the repo.
- If a task requires crossing boundaries, minimize the coupling introduced and explain why.

## Testing and verification

- Verify changes with the smallest set of checks that gives real confidence.
- Prefer targeted tests first, then broader validation as needed.
- Reuse existing test patterns before inventing new ones.
- Add or update tests when behavior changes or when the risk justifies it.
- Do not claim completion without running relevant verification steps when they are available.

Standard verification steps:

- `npm run lint`
- `npm run type-check`
- `npx vitest run <path-or-pattern> --exclude .worktrees/**` for targeted checks, or `npm run test:unit`
- `npm run test:unit`, `npm run test:ci`, and `npm run test:e2e` as risk requires
- `npm run build`

## Performance and operational caution

- Be mindful of runtime cost, memory use, network calls, and I/O volume.
- Avoid accidental N+1 behavior, repeated heavy work, and unnecessary allocations where relevant.
- Preserve logging, monitoring, and error-handling expectations already present in the repo.
- Do not silently swallow errors.
- Do not degrade security, validation, or auditability for convenience.

## Definition of done

A task is not complete until:

- The requested behavior is implemented or the requested issue is explained
- The solution is minimal and understandable
- Naming and control flow are clear
- Architectural boundaries are preserved or intentionally changed with explanation
- Relevant checks have been run
- Remaining risks, assumptions, or follow-ups are explicitly stated

## Handoff format

When finishing work, provide:

1. What changed
2. Why this approach was chosen
3. What was verified
4. Any remaining risks, assumptions, or follow-up work

## Repo-specific section

- Primary directories: `src/domain`, `src/application`, `src/infrastructure`, `src/presentation`, `src/shared`, `src/test-utils`, `scripts`, `cypress`, `docs/structurizr`, `public`
- Main commands: `npm run dev`, `npm run dev:worktree`, `npm run dev:status`, `npm run dev:stop`, `npm run worktree:add -- <branch> [path]`, `npm run worktree:bootstrap -- [path]`, `npm run lint`, `npm run type-check`, `npm run test:unit`, `npm run test:ci`, `npm run test:e2e`, `npm run build`, `npm run dep-graph`, `npm run diagram:video`
- Local architectural rules: Follow the repo's hexagonal split: `src/domain` for core rules and models, `src/application` for use cases and ports, `src/infrastructure` for adapters, persistence, video pipelines, and DI, and `src/presentation` for Vue and Pinia UI. Keep dependency wiring in `src/infrastructure/di`, not inside use cases. Prefer `mcp__git__*` for safe git and worktree operations, `mcp__chrome-devtools__*` for browser and UI investigation, `mcp__context7__*` for current library docs, and `mcp__mermaid__generate` for quick diagrams.
- High-risk areas: video ingestion and parsing under `src/infrastructure/video*`, persistence and migrations under `src/infrastructure/database` and `src/infrastructure/repository`, orchestration in `src/application/usecases`, UI state in `src/presentation/stores`, and worktree/dev tooling in `scripts/`
- Required skills: `using-superpowers` at conversation start; `writing-plans` for larger or architectural changes; `systematic-debugging` for bugs; `verification-before-completion` before claiming implementation work is done; `requesting-code-review` after meaningful refactors or contract changes; `using-git-worktrees` for isolated feature work; `test-driven-development` when implementing features or fixes; `dispatching-parallel-agents` or `subagent-driven-development` only for clearly separable read-heavy work; `writing-skills`, `skill-creator`, and `skill-installer` only when the task is about skills themselves
