# Structurizr Lite Docker Compose Design

## Summary
Add a dedicated Docker Compose file to run Structurizr Lite against the existing DSL workspace at `docs/structurizr/video-file-extraction.dsl`.

## Architecture
- Compose file at repo root: `docker-compose.structurizr.yml`.
- Single service: `structurizr-lite` using the `structurizr/lite:latest` image.
- Workspace directory mounted from `./docs/structurizr` to `/usr/local/structurizr`.
- Environment variable `STRUCTURIZR_WORKSPACE=video-file-extraction.dsl` to select the DSL file.

## Components
- Docker Compose service with port mapping `8080:8080`.
- Volume mount for workspace files.
- No additional services or persistence required.

## Data Flow
- Container reads the DSL from `/usr/local/structurizr/video-file-extraction.dsl` on startup.
- Structurizr Lite serves the rendered workspace via its web UI on port 8080.

## Error Handling
- Missing or invalid DSL results in container errors visible via `docker compose logs structurizr-lite`.
- Users can fix the DSL file and restart the container.

## Testing
- Manual verification: `docker compose -f docker-compose.structurizr.yml up` and load `http://localhost:8080`.
- Optional: edit the DSL and confirm it reloads after container restart.
