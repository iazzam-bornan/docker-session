# First Example

This is the local demo app for the Docker session: a small Node/Express app with MongoDB.

## What It Shows

- Dockerfile for packaging the app
- `docker compose` for running app + database together
- Stable local setup with one command

## Prerequisites

- Docker Desktop or Docker Engine
- Docker Compose v2 (`docker compose`)

## Run It

From the repo root:

```powershell
cd first-example
docker compose up --build
```

Then open:

- App: `http://localhost:3000`

## Stop It

```powershell
docker compose down
```

To also remove the Mongo volume:

```powershell
docker compose down -v
```

## Useful Demo Commands

Rebuild after code changes:

```powershell
docker compose up --build
```

See running containers:

```powershell
docker compose ps
```

See logs:

```powershell
docker compose logs -f
```

Open a shell in the app container:

```powershell
docker compose exec app sh
```

## If You Want Them To Try Dockerizing It

A simple hands-on flow:

1. Start with the plain app and explain its runtime needs.
2. Show the `Dockerfile` and explain `FROM`, `WORKDIR`, `COPY`, `RUN`, and `CMD`.
3. Build the image:

```powershell
docker build -t first-example .
```

4. Explain why the app also needs Mongo, then move to `docker-compose.yml`.
5. Run both services together:

```powershell
docker compose up --build
```

## Session Talking Points

- The environment is part of the system.
- The app container and the database container communicate over the Compose network.
- Rebuilding is often cleaner than hand-fixing a broken local setup.
