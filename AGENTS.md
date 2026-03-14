# Repository Guidelines

## Mandatory workflow triggers

- At the start of each conversation use $using-superpowers to determine which skills are applicable to the task
- If a task affects architecture, cross-layer boundaries, public contracts, or more than 3 files, use $writing-plans before editing.
- If a task changes implementation code, start by creating a worktree with $using-git-worktress and use $verification-before-completion before handoff.
- If a task is primarily debugging, use $systematic-debugging.
- If a task requests refactoring for maintainability or clarity, use $requesting-code-review after implementation.
- If a task needs diagrams or architectural explanation, use $writing-plans or the architecture/diagram skill before editing.
- If the task requires parallel research or isolated investigation, use subagents only for read-heavy exploration; avoid parallel write-heavy edits.
- Never revert unrelated user changes, never use destructive git commands without approval, and stop if unexpected local changes conflict with the task.

## Project Structure & Module Organization

The app follows a hexagonal layout: core domain rules live in `src/domain/...` (entities, valueObjects, repositories), orchestration sits in `src/application/...` (usecases, services, ports), and runtime adapters are in `src/infrastructure/...` (adapters, DI, dto, video pipelines). UI state and views live in `src/presentation/...` alongside Pinia stores and assets, with `App.vue` and `main.ts` wiring Vue 3. Cypress specs and fixtures stay under `cypress/`, while `scripts/` hosts auxiliary tooling such as `multiDev.ts` and dependency graph generators. Static assets belong in `public/`, and generated dependency graphs land in `dep-graphs/`.

- Application use cases (`src/application/usecases`) only define orchestration logic; dependency composition for those use cases belongs in infrastructure DI modules (e.g., `src/infrastructure/di/container.ts`). Never mix DI wiring and use case definitions in the same file.

## Build, Test, and Development Commands

Use `npm run dev` for the Vite dev server (hot reload on :5173). `npm run build` performs type-checking and produces the production bundle; follow with `npm run preview` to serve it on :4173. Run `npm run lint` to auto-fix style issues, and `npm run type-check` when validating editor diagnostics. `npm run test:unit` executes Vitest (jsdom environment scoped to `src/`), while `npm run test:e2e` spins up the preview server and runs Cypress headlessly; `npm run test:e2e:dev` opens the Cypress runner. To regenerate architectural graphs, call `npm run dep-graph`.

## Agent Worktree Workflow

Agents should perform implementation work from a git worktree instead of the primary checkout so the main workspace stays clean for review and coordination. When working inside a worktree, use `npm run dev:worktree` instead of `npm run dev`; use `npm run dev:status` to inspect active Vite servers, and `npm run dev:stop` to stop only the current worktree's server.

Do not delete a worktree as soon as the code is ready. Keep the worktree intact until a human has manually signed off on the changes. After manual signoff, stop the worktree's dev server, remove the worktree, and clean up any temporary branch state that is no longer needed.

## Coding Style & Naming Conventions

Project code is TypeScript-first with Vue 3 Composition API. Use two-space indentation, keep components in PascalCase filenames (e.g., `VideoCard.vue`), and favour camelCase for composables/services. Domain types belong in `src/domain` and should mirror the folder names (e.g., repositories in `repositories/`). Treat Pinia stores as `useXStore`. Prettier + ESLint enforce formatting; run lint before committing and avoid disabling rules unless justified inline.

## Naming and readability standards

- Prefer explicit names over abbreviations unless the abbreviation is domain-standard.
- Functions should do one thing; split mixed responsibilities.
- Prefer small composable helpers over deep nested conditionals.
- Do not introduce abstractions unless at least one of these is true:
  - duplication exists in 2+ real call sites
  - a boundary/interface already exists in the architecture
  - the abstraction simplifies testing or dependency direction
- Keep control flow easy to read; reduce branching depth where practical.
- Favor boring, obvious code over clever code.

## Testing Guidelines

Place new unit specs alongside source using `.spec.ts` or `.test.ts` suffixes and leverage Vue Test Utils for component mounts. Target meaningful scenarios rather than implementation details. For domain/application logic, mock infrastructure dependencies so Vitest runs remain fast. End-to-end flows belong in `cypress/e2e` with descriptive `.cy.ts` names; group fixtures under `cypress/fixtures`. Record manual verification steps in PRs whenever Cypress coverage is absent.

## Commit & Pull Request Guidelines

Follow Conventional Commit styles seen in history (`feat:`, `chore:`, `refactor:`) with concise, imperative summaries. Reference linked issues using `#123` when available and scope one logical change per commit. PRs should include: purpose, high-level approach, testing evidence (`npm run test:unit`, `npm run test:e2e`), and any dependency graph updates or screenshots that help reviewers. Request review before merging and ensure CI (where available) stays green.

## Architecture Decisions

- **Transient video blobs**: The application never persists uploaded video files or blob URLs. Browser File objects only exist for the current tab session, and duplicating large videos into IndexedDB/Cache API is both storage-heavy and confusing for users. Every session therefore requires the user to re-select files via the upload dialog.
- **Persistent metadata only**: We still wrap each session’s videos in durable metadata (votes, pins, derived tags, thumbnails) stored through the aggregate repository so UI logic can rely on consistent domain state without hanging on to the video bytes themselves.
