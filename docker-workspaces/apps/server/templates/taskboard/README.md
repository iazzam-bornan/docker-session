# taskboard

A full-stack task management app: React + Express + MongoDB + Redis.

## what's here

```
taskboard/
  backend/
    Dockerfile      YOUR TASK — fill in the blanks
    src/            TypeScript Express API
    package.json
  frontend/
    Dockerfile      YOUR TASK — multi-stage build!
    src/            React + Vite app
    nginx.conf      reverse proxy config
    package.json
  seed/
    seed.js         pre-populates MongoDB with sample tasks
  docker-compose.yml  orchestrates all 4 services (commented!)
  solutions/
    backend.Dockerfile    working backend answer
    frontend.Dockerfile   working frontend answer
```

## exercise: write two Dockerfiles

This project has two Dockerfiles to fill in — the backend and the frontend.
The backend is similar to greeter-api but adds a TypeScript compile step.
The frontend introduces **multi-stage builds** (build with Node, serve with nginx).

### 1. backend/Dockerfile

Open `backend/Dockerfile`. Hints are inline. The key difference from
greeter-api:
- You need devDependencies (typescript is a devDep)
- There's a compile step: `npx tsc` turns `src/*.ts` into `dist/*.js`
- You run the compiled output: `node dist/index.js`

### 2. frontend/Dockerfile (multi-stage)

Open `frontend/Dockerfile`. This one has TWO stages:

**Stage 1 (build):** Use Node to install deps and run `npx vite build`.
This produces a `dist/` folder with static HTML/JS/CSS.

**Stage 2 (runtime):** Start fresh from `nginx:alpine`, copy the built
files from stage 1, copy the nginx config. Final image is ~25MB.

### docker-compose.yml

Already written for you (with comments explaining every line). It wires
up 4 services: mongo, redis, backend, frontend.

### build & run

Once both Dockerfiles are filled in:

```bash
docker compose up --build
```

- Frontend: http://localhost:8080
- Backend API: http://localhost:3000/health

### stuck?

Check `solutions/backend.Dockerfile` and `solutions/frontend.Dockerfile`
for the working answers.

### quick reference

| Instruction        | What it does                                    |
|--------------------|-------------------------------------------------|
| `FROM ... AS name` | Start a named build stage                       |
| `COPY --from=name` | Copy files from a previous stage                |
| `RUN npx tsc`      | Compile TypeScript during build                 |
| `RUN npx vite build` | Build React app into static files             |
| Multi-stage        | Final image only contains the last FROM's stuff |
