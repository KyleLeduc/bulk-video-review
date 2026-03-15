# bulk-video-review

See [`AGENTS.md`](AGENTS.md) for contributor guidelines.

## Video File Extraction Diagrams

Generated from the Structurizr DSL in `docs/structurizr/` (defaults to `video-file-extraction.dsl` unless you set `STRUCTURIZR_WORKSPACE`). Outputs land in `docs/structurizr/diagrams/*.png`:

### C1 - System

![](docs/structurizr/diagrams/structurizr-video-file-extraction-c1.png)

### C2 - Container

![](docs/structurizr/diagrams/structurizr-video-file-extraction-c2.png)

### C3 - Component

![](docs/structurizr/diagrams/structurizr-video-file-extraction-c3.png)

Run `npm run diagram:video` after ensuring Structurizr CLI and Graphviz (`dot`) are available. The devcontainer installs both via Dockerfile; otherwise set `STRUCTURIZR_CLI` (or `STRUCTURIZR_CLI_SH`) to your local install.

---

## Project Setup

```sh
npm install
```

## Worktree Workflow

The canonical worktree command is:

```sh
npm run worktree
```

With no subcommand in an interactive terminal, it opens the arrow-key worktree launcher.

In the interactive launcher, `Up`, `Stop`, and `Remove` prompt you to choose from the managed worktree list.

Create a bootstrapped worktree with:

```sh
npm run worktree -- add <branch>
```

This creates `.worktrees/<branch-name>` by default, links the main workspace `node_modules`, and links any repo-root `.env` or `.env.*` files into the new worktree.

To bootstrap an existing worktree from the main checkout:

```sh
npm run worktree -- bootstrap .worktrees/<branch-name>
```

With no target, `npm run worktree -- bootstrap` bootstraps the current checkout or linked worktree.

Common scripted commands:

```sh
npm run worktree -- help
npm run worktree -- ls
npm run worktree -- ps
npm run worktree -- up thumbnail-queue
npm run worktree -- stop thumbnail-queue
npm run worktree -- remove thumbnail-queue
```

Legacy wrappers still work and now delegate to the central CLI:

```sh
npm run dev:worktree -- thumbnail-queue
npm run dev:status
npm run dev:stop
npm run worktree:add -- <branch>
npm run worktree:bootstrap -- .worktrees/<branch-name>
```

If you run `npm run worktree -- up` or `npm run worktree -- stop` from the main workspace root without an interactive TTY and `./.worktrees/` contains managed checkouts, the command exits with an error and asks you to pass an explicit worktree name or path.

### Compile and Hot-Reload for Development

```sh
npm run dev
```

### Type-Check, Compile and Minify for Production

```sh
npm run build
```

### Run Unit Tests with [Vitest](https://vitest.dev/)

```sh
npm run test:unit
```

### Run End-to-End Tests with [Cypress](https://www.cypress.io/)

```sh
npm run test:e2e:dev
```

This runs the end-to-end tests against the Vite development server.

It is much faster than the production build.

But it's still recommended to test the production build with `test:e2e` before deploying (e.g. in CI environments):

```sh
npm run build
npm run test:e2e
```

### Lint with [ESLint](https://eslint.org/)

```sh
npm run lint
```

## Deploying

Deploys to Github Pages

```sh
npm run deploy
```
