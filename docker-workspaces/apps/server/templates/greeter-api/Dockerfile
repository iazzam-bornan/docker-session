# ──────────────────────────────────────────────────────────
# Dockerfile for greeter-api
# ──────────────────────────────────────────────────────────
#
# Goal: containerize this Node.js Express app.
# The app is server.js, it listens on port 3000,
# and has one dependency (express) in package.json.
#
# Fill in the ??? placeholders below. Each step has a hint.
# If you're stuck, check solutions/Dockerfile for the answer.
#
# When you're done, build and run:
#   docker build -t greeter .
#   docker run -p 3000:3000 greeter
#
# ──────────────────────────────────────────────────────────

# STEP 1: Base image
# Hint: we need Node.js. The official images on Docker Hub
#       are named "node:<version>". Alpine variants are smaller.
#       Try: node:20-alpine

# FROM ???

# STEP 2: Working directory
# Hint: pick any path inside the container, like /app.
#       WORKDIR both creates it and cd's into it.

# WORKDIR ???

# STEP 3: Install dependencies
# Hint: copy package.json FIRST, then run npm install.
#       This order lets Docker cache the install layer —
#       it won't re-run unless package.json changes.
#       Use --omit=dev to skip devDependencies (we don't need them).

# COPY ??? ???
# RUN ???

# STEP 4: Copy source code
# Hint: now copy everything else with COPY . .
#       This goes AFTER the install so editing server.js
#       doesn't invalidate the cached npm install layer.

# COPY ???

# STEP 5: Expose the port
# Hint: the app listens on port 3000. EXPOSE documents this.
#       (It doesn't actually open the port — that's what -p does at runtime.)

# EXPOSE ???

# STEP 6: Start command
# Hint: use CMD to tell Docker what to run when the container starts.
#       The exec form is: CMD ["executable", "arg1", "arg2"]
#       Our app starts with: node server.js

# CMD ???
