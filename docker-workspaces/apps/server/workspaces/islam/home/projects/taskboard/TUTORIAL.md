# Tutorial: Full-Stack Docker with Compose

This tutorial builds on the greeter-api exercise. You'll containerize
a real full-stack app (React + Express + MongoDB + Redis) and run it
all with a single `docker compose up` command.

If you haven't done the greeter-api tutorial yet, start there first —
this one assumes you know FROM, WORKDIR, COPY, RUN, EXPOSE, and CMD.

---

## Part 1: Understand the Architecture

```
browser → nginx (port 8080)
            ├── static files (React app)
            └── /api/* → backend (port 3000)
                           ├── MongoDB (data)
                           └── Redis (cache)
```

Four services. Two of them (mongo, redis) use pre-built images from
Docker Hub — no Dockerfile needed. Two of them (backend, frontend) are
our code — you'll write their Dockerfiles.

Look at `docker-compose.yml` — it's fully commented and explains how
the services are wired together.

---

## Part 2: Backend Dockerfile

Open `backend/Dockerfile`.

### What's different from greeter-api?

The backend is TypeScript. The source code is in `src/` and needs to be
compiled to JavaScript in `dist/` before it can run. The flow is:

```
npm install → npx tsc → node dist/index.js
```

### Fill it in step by step

**Step 1 — Base image**

```dockerfile
FROM node:20-slim
```

We use `slim` instead of `alpine` here. Alpine uses musl libc which can
cause issues with some native npm packages. Slim is a safe choice for
most Node.js apps.

**Step 2 — Working directory**

```dockerfile
WORKDIR /app
```

**Step 3 — Install dependencies**

```dockerfile
COPY package.json ./
RUN npm install
```

Note: we do NOT use `--omit=dev` here. Why? Because `typescript` is a
devDependency, and we need it to compile. In a production-optimized
build you'd use a multi-stage approach (like the frontend), but for the
backend this simpler approach works fine.

**Step 4 — Copy source and compile**

```dockerfile
COPY . .
RUN npx tsc
```

`npx tsc` reads `tsconfig.json`, which says:
- Source is in `src/`
- Output goes to `dist/`

After this step, `dist/index.js` exists inside the container.

**Step 5 — Expose and start**

```dockerfile
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

Important: run `dist/index.js` (the compiled JavaScript), not
`src/index.ts` (the TypeScript source). Node.js can't run .ts files
directly without a runtime like tsx.

### Verify it builds

Don't run it standalone yet — it needs MongoDB and Redis. But you can
check that the Dockerfile builds:

```bash
cd backend
docker build -t taskboard-backend .
cd ..
```

If it builds without errors, your Dockerfile is correct.

---

## Part 3: Frontend Dockerfile (Multi-Stage Build)

Open `frontend/Dockerfile`. This is the interesting one.

### Why multi-stage?

The frontend is a React app built with Vite. In production, we don't
need Node.js at all — we just need the compiled HTML/JS/CSS files
served by a web server.

A multi-stage build lets us:
1. **Stage 1**: Use Node.js to install deps and build the app
2. **Stage 2**: Copy ONLY the build output into a tiny nginx image

The final image is ~25MB instead of ~500MB. Everything from stage 1
(node_modules, source code, Node.js itself) is thrown away.

### Fill it in step by step

**Stage 1 — Build**

```dockerfile
FROM node:20-slim AS build
WORKDIR /app
```

`AS build` gives this stage a name. We'll reference it in stage 2.

```dockerfile
COPY package.json ./
RUN npm install
COPY . .
RUN npx vite build
```

After `npx vite build`, a `dist/` folder appears with:
- `index.html`
- `assets/` with hashed .js and .css files

**Stage 2 — Serve**

```dockerfile
FROM nginx:alpine
```

This starts a COMPLETELY FRESH image. Nothing from stage 1 exists here
— no Node.js, no node_modules, no source code. Only what we explicitly
copy over.

```dockerfile
COPY --from=build /app/dist /usr/share/nginx/html
```

`--from=build` means "copy from the stage named 'build'". We grab the
built static files and put them where nginx expects to serve from.

```dockerfile
COPY nginx.conf /etc/nginx/conf.d/default.conf
```

Our custom nginx config does two things:
- Serves the React app for all routes (SPA routing)
- Proxies `/api/*` requests to the backend container

```dockerfile
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

`daemon off` keeps nginx in the foreground so Docker doesn't think the
container exited.

### Verify it builds

```bash
cd frontend
docker build -t taskboard-frontend .
cd ..
```

---

## Part 4: Run Everything with Compose

Now that both Dockerfiles are written, start the full stack:

```bash
docker compose up --build
```

`--build` tells Compose to rebuild images before starting. You'll see:
1. MongoDB starts + runs the seed script (10 sample tasks)
2. Redis starts
3. Backend waits for mongo + redis to be healthy, then starts
4. Frontend waits for backend to be healthy, then starts

Open http://localhost:8080 — you should see the task board with
pre-populated tasks.

### Useful commands

```bash
# See running services
docker compose ps

# See logs from all services
docker compose logs

# See logs from one service
docker compose logs backend

# Stop everything
docker compose down

# Stop and wipe the database
docker compose down -v

# Rebuild after changing code
docker compose up --build
```

---

## Part 5: What You Learned

### Dockerfile concepts
- **FROM** — base image
- **WORKDIR** — working directory
- **COPY** — copy files in
- **RUN** — execute during build
- **EXPOSE** — document ports
- **CMD** — default start command
- **Multi-stage builds** — separate build and runtime environments
- **Layer caching** — copy package.json before source for faster rebuilds

### Docker Compose concepts
- **services** — each container in the stack
- **build** — point to a directory with a Dockerfile
- **image** — use a pre-built image from Docker Hub
- **ports** — map host ports to container ports
- **environment** — pass env vars to containers
- **depends_on + healthcheck** — control startup order
- **volumes** — persist data across restarts
- **named volumes** — managed by Docker, survive `down` but not `down -v`

### Architecture patterns
- **Service discovery** — containers on the same Compose network can reach
  each other by service name (`mongo`, `redis`, `backend`)
- **Reverse proxy** — nginx routes `/api/*` to the backend so the frontend
  doesn't need to know the backend's port
- **Health checks** — services report their readiness so dependents don't
  start too early

---

## Stuck?

Check `solutions/backend.Dockerfile` and `solutions/frontend.Dockerfile`
for the working Dockerfiles.
