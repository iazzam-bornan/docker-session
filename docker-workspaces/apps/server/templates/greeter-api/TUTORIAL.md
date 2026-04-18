# Tutorial: Your First Dockerfile

This tutorial walks you through containerizing a simple Node.js app
step by step. By the end, you'll understand every line of a Dockerfile.

---

## 1. Look at the app

First, let's see what we're working with:

```bash
ls
cat server.js
cat package.json
```

It's a tiny Express API:
- `server.js` — a single file with two endpoints
- `package.json` — one dependency (express)
- It listens on port 3000

Try to imagine: what does someone need to run this app?
- Node.js installed
- The source code
- `npm install` to get express
- `node server.js` to start it

A Dockerfile automates exactly that.

---

## 2. Open the Dockerfile

```bash
code .
```

Open `Dockerfile` in the editor. You'll see commented-out steps with
`???` placeholders. We'll fill them in one by one.

---

## 3. Step 1 — FROM (base image)

Every Dockerfile starts with FROM. It tells Docker "start with this
existing image and build on top of it."

We need Node.js, so we use the official Node image:

```dockerfile
FROM node:20-alpine
```

**Why alpine?** It's a minimal Linux distribution (~50MB vs ~350MB for
the full image). Smaller = faster to download, less attack surface.

Uncomment the FROM line and replace `???` with `node:20-alpine`.

---

## 4. Step 2 — WORKDIR

WORKDIR sets the directory inside the container where all subsequent
commands will run. Think of it as `mkdir -p /app && cd /app`.

```dockerfile
WORKDIR /app
```

Uncomment and replace `???` with `/app`.

---

## 5. Step 3 — COPY + RUN (install dependencies)

This is the most important pattern in Dockerfile optimization:

```dockerfile
COPY package.json ./
RUN npm install --omit=dev
```

**Why copy package.json separately?** Docker builds in layers. Each
instruction creates a new layer. If a layer hasn't changed, Docker
reuses the cached version.

By copying package.json FIRST and installing BEFORE copying source code:
- Changing `server.js` → Docker reuses the cached npm install layer
- Changing `package.json` → Docker re-runs npm install

This saves minutes on every rebuild.

**Why --omit=dev?** We don't need devDependencies in production.

Uncomment both lines and fill them in.

---

## 6. Step 4 — COPY (source code)

Now copy everything else:

```dockerfile
COPY . .
```

The first `.` is "everything in the build context" (the folder you ran
`docker build` from). The second `.` is the destination inside the
container (which is `/app` because of our WORKDIR).

---

## 7. Step 5 — EXPOSE

```dockerfile
EXPOSE 3000
```

EXPOSE doesn't actually open a port. It's documentation — it tells
whoever runs this container "the app inside expects port 3000."

The actual port mapping happens at runtime with `docker run -p 3000:3000`.

---

## 8. Step 6 — CMD

```dockerfile
CMD ["node", "server.js"]
```

CMD is the default command that runs when someone starts a container
from this image. The JSON array form (exec form) is preferred because
it handles signals correctly — important for graceful shutdown.

---

## 9. Build it

Save the Dockerfile, then in the terminal:

```bash
docker build -t greeter .
```

- `-t greeter` tags (names) the image "greeter"
- `.` tells Docker the build context is the current directory

Watch the output — you'll see each step execute as a layer.

---

## 10. Run it

```bash
docker run -p 3000:3000 greeter
```

- `-p 3000:3000` maps your machine's port 3000 to the container's port 3000

Open http://localhost:3000/hello/yourname in the browser.

---

## 11. What you learned

- `FROM` — start from an existing image
- `WORKDIR` — set the working directory
- `COPY` — copy files into the container
- `RUN` — execute a command during build
- `EXPOSE` — document the port
- `CMD` — set the start command
- Layer caching — copy package.json before source code

---

## Next: try the taskboard project

The taskboard is a full-stack app with:
- A TypeScript backend (adds a compile step)
- A React frontend (introduces multi-stage builds)
- MongoDB + Redis (introduces docker-compose)

```bash
cd ../taskboard
code .
cat README.md
```
