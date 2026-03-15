# Repository Guidelines

> Replace bracketed placeholders like `[COMMAND:build]` or `[SKILL:plan]` with repo-specific values.
> If placeholders are still unresolved, stop and ask for the missing repo-specific values rather than inventing them.
> Keep this file short, operational, and stable. Put detailed procedures inside skills.

## Purpose

This repository should be changed with a bias toward clarity, minimalism, and maintainability.

Priorities:
1. Preserve correctness
2. Preserve or improve readability
3. Preserve architectural boundaries
4. Minimize code and surface area
5. Avoid unnecessary abstractions, dependencies, and churn

## Context gathering

- Before asking clarifying questions, inspect the repository, manifests, configs, scripts, and adjacent code to resolve discoverable facts first.
- Prefer documented repo scripts and existing workflows over ad hoc command invention when they already exist.
- Identify the minimum relevant files, layers, and boundaries before editing.
- Ask concise questions only when the remaining ambiguity materially changes implementation or validation.

## Mandatory workflow triggers

- If the task is ambiguous, cross-cutting, risky, or likely to touch more than [N] files, use [SKILL:plan] before editing.
- If the task is primarily debugging, use [SKILL:debug] before changing code.
- If the task changes implementation code, use [SKILL:verify] before handoff.
- If the task introduces or changes abstractions, public contracts, dependency direction, or architectural boundaries, use [SKILL:review] after implementation.
- If the task requires diagrams, architecture explanation, or impact analysis, use [SKILL:diagram-or-architecture] before editing.
- Use subagents only for clearly separable work with a single clear responsibility. Avoid parallel write-heavy edits unless explicitly required.

## Safety and git rules

- Never revert, overwrite, or delete unrelated user changes.
- Never use destructive git commands without explicit approval.
- Stop and report if the working tree contains unexpected changes that create risk.
- Prefer the smallest safe change that solves the problem.
- Do not rename, move, or reorganize files unless the task requires it.
- Do not introduce new dependencies, frameworks, or patterns unless justified by the task or approved by the user.

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
- Keep policy and business rules separate from framework and I/O details where practical.
- Do not leak transport, storage, or UI concerns into core logic unless that is the established design of the repo.
- If a task requires crossing boundaries, minimize the coupling introduced and explain why.

## Testing and verification

- Verify changes with the smallest set of checks that gives real confidence.
- Prefer targeted checks first, then broader validation as needed.
- Reuse existing test patterns before inventing new ones.
- Add or update tests when behavior changes or when the risk justifies it.
- Do not claim completion, success, or correctness without fresh verification output from the current session.

Standard verification steps:
- [COMMAND:format-or-lint]
- [COMMAND:typecheck-if-applicable]
- [COMMAND:test-targeted]
- [COMMAND:test-broader-if-needed]
- [COMMAND:build-or-package-if-relevant]

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
- Remaining risks, assumptions, or follow-up work are explicitly stated

## Handoff format

When finishing work, provide:
1. What changed
2. Why this approach was chosen
3. What was verified
4. Any remaining risks, assumptions, or follow-up work

## Repo-specific section

Fill in:
- Primary directories: [DIRS]
- Main commands: [COMMANDS]
- Local architectural rules: [RULES]
- High-risk areas: [AREAS]
- Required skills: [SKILLS]
