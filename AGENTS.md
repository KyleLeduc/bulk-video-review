# Repository Guidelines

## Project Structure & Module Organization
The app follows a hexagonal layout: core domain rules live in `src/domain/...` (entities, valueObjects, repositories), orchestration sits in `src/application/...` (usecases, services, ports), and runtime adapters are in `src/infrastructure/...` (adapters, DI, dto, video pipelines). UI state and views live in `src/presentation/...` alongside Pinia stores and assets, with `App.vue` and `main.ts` wiring Vue 3. Cypress specs and fixtures stay under `cypress/`, while `scripts/` hosts auxiliary tooling such as `multiDev.ts` and dependency graph generators. Static assets belong in `public/`, and generated dependency graphs land in `dep-graphs/`.

## Build, Test, and Development Commands
Use `npm run dev` for the Vite dev server (hot reload on :5173). `npm run build` performs type-checking and produces the production bundle; follow with `npm run preview` to serve it on :4173. Run `npm run lint` to auto-fix style issues, and `npm run type-check` when validating editor diagnostics. `npm run test:unit` executes Vitest (jsdom environment scoped to `src/`), while `npm run test:e2e` spins up the preview server and runs Cypress headlessly; `npm run test:e2e:dev` opens the Cypress runner. To regenerate architectural graphs, call `npm run dep-graph`.

## Coding Style & Naming Conventions
Project code is TypeScript-first with Vue 3 Composition API. Use two-space indentation, keep components in PascalCase filenames (e.g., `VideoCard.vue`), and favour camelCase for composables/services. Domain types belong in `src/domain` and should mirror the folder names (e.g., repositories in `repositories/`). Treat Pinia stores as `useXStore`. Prettier + ESLint enforce formatting; run lint before committing and avoid disabling rules unless justified inline.

## Testing Guidelines
Place new unit specs alongside source using `.spec.ts` or `.test.ts` suffixes and leverage Vue Test Utils for component mounts. Target meaningful scenarios rather than implementation details. For domain/application logic, mock infrastructure dependencies so Vitest runs remain fast. End-to-end flows belong in `cypress/e2e` with descriptive `.cy.ts` names; group fixtures under `cypress/fixtures`. Record manual verification steps in PRs whenever Cypress coverage is absent.

## Commit & Pull Request Guidelines
Follow Conventional Commit styles seen in history (`feat:`, `chore:`, `refactor:`) with concise, imperative summaries. Reference linked issues using `#123` when available and scope one logical change per commit. PRs should include: purpose, high-level approach, testing evidence (`npm run test:unit`, `npm run test:e2e`), and any dependency graph updates or screenshots that help reviewers. Request review before merging and ensure CI (where available) stays green.

## Architecture Decisions
- **Transient video blobs**: The application never persists uploaded video files or blob URLs. Browser File objects only exist for the current tab session, and duplicating large videos into IndexedDB/Cache API is both storage-heavy and confusing for users. Every session therefore requires the user to re-select files via the upload dialog.
- **Persistent metadata only**: We still wrap each session’s videos in durable metadata (votes, pins, derived tags, thumbnails) stored through the aggregate repository so UI logic can rely on consistent domain state without hanging on to the video bytes themselves.
