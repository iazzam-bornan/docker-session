# ──────────────────────────────────────────────────────────
# Dockerfile for taskboard frontend (MULTI-STAGE BUILD)
# ──────────────────────────────────────────────────────────
#
# Goal: build the React app with Vite, then serve the
# static output with nginx. Two stages, tiny final image.
#
# Fill in the ??? placeholders. Each step has a hint.
# If stuck, check ../solutions/frontend.Dockerfile
#
# When done:
#   cd ..
#   docker compose up --build
#
# ──────────────────────────────────────────────────────────

# ═══════════════════════════════════════════════════════════
# STAGE 1: Build (uses Node.js)
# ═══════════════════════════════════════════════════════════
#
# Hint: name this stage "build" with "AS build" so we can
#       reference it in stage 2 with COPY --from=build

# FROM ??? AS build
# WORKDIR /app

# Install dependencies
# Hint: same pattern as the backend — package.json first,
#       then npm install (we need devDeps for the build).

# COPY ??? ???
# RUN ???

# Copy source and build
# Hint: Vite produces a dist/ folder with static HTML/JS/CSS.
#       The build command is: npx vite build

# COPY ???
# RUN ???

# ═══════════════════════════════════════════════════════════
# STAGE 2: Serve (uses nginx)
# ═══════════════════════════════════════════════════════════
#
# Hint: start completely fresh from nginx:alpine.
#       Nothing from stage 1 exists here unless you COPY it.

# FROM ???

# Copy the built files from stage 1
# Hint: nginx serves files from /usr/share/nginx/html
#       Use: COPY --from=build /app/dist /usr/share/nginx/html

# COPY --from=build ???

# Copy the nginx config
# Hint: the nginx.conf in this folder sets up /api proxying
#       to the backend and SPA routing for React.
#       Copy it to: /etc/nginx/conf.d/default.conf

# COPY ???

# Expose and start
# Hint: nginx listens on port 80.
#       Start command: nginx -g "daemon off;"
#       (The "daemon off" keeps nginx in the foreground so
#       Docker doesn't think the container exited.)

# EXPOSE ???
# CMD ???
