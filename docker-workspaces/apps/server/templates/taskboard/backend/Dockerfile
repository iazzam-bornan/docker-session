# ──────────────────────────────────────────────────────────
# Dockerfile for taskboard backend
# ──────────────────────────────────────────────────────────
#
# Goal: containerize this TypeScript Express API.
# The build process:  npm install → tsc → node dist/index.js
#
# Fill in the ??? placeholders. Each step has a hint.
# If stuck, check ../solutions/backend.Dockerfile
#
# When done:
#   cd ..
#   docker compose up --build
#
# ──────────────────────────────────────────────────────────

# STEP 1: Base image
# Hint: we need Node.js. "slim" is lighter than the default
#       but has enough for npm and tsc to work.

# FROM ???

# STEP 2: Working directory

# WORKDIR ???

# STEP 3: Install dependencies
# Hint: copy package.json first (layer caching!), then npm install.
#       Unlike greeter-api, we need devDependencies here because
#       typescript is a devDep and we need it to compile.
#       So do NOT use --omit=dev.

# COPY ??? ???
# RUN ???

# STEP 4: Copy source code and compile
# Hint: copy everything, then run the TypeScript compiler.
#       tsconfig.json says: src/*.ts compiles to dist/*.js
#       The compiler command is: npx tsc

# COPY ???
# RUN ???

# STEP 5: Expose and start
# Hint: the API listens on port 3000.
#       Run the COMPILED output (dist/index.js), not the .ts source.

# EXPOSE ???
# CMD ???
