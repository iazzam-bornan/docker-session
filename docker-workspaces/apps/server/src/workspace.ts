// ─────────────────────────────────────────────────────────────────────────
// per-user workspace + port pool
//
// every session needs:
//   • a private *home directory* on disk so the user can navigate a
//     real filesystem (not just the project). the layout looks like:
//
//       <workspaceRoot>/<sessionId>/home/
//         ├── Desktop/
//         ├── Documents/
//         │   └── welcome.md
//         ├── Downloads/
//         └── projects/
//             └── greeter-api/   ← cloned from apps/server/templates
//
//     the user thinks they're in /home/<them>/, the server maps that to
//     <workspaceRoot>/<sessionId>/home/.
//   • a private slice of the host's port range so multiple users running
//     `docker run -p 3000:3000` don't collide
// ─────────────────────────────────────────────────────────────────────────

import {
  cpSync,
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { resolve } from "node:path"

const TEMPLATES_ROOT = resolve(import.meta.dirname, "..", "templates")

const GREETER_TEMPLATE = resolve(TEMPLATES_ROOT, "greeter-api")
const TASKBOARD_TEMPLATE = resolve(TEMPLATES_ROOT, "taskboard")

/**
 * Subpath inside the home dir where the *first* project lives. Used by
 * the session type to cache the "default project dir" for docker commands.
 * The second project (taskboard) also lives under ~/projects/.
 */
export const PROJECT_SUBPATH = "projects/greeter-api"

/** Absolute path of the home directory for this session. */
export function homeDirFor(workspaceRoot: string, sessionId: string): string {
  return resolve(workspaceRoot, sessionId, "home")
}

/** Absolute path of the project (greeter-api) inside the user's home. */
export function projectDirFor(workspaceRoot: string, sessionId: string): string {
  return resolve(homeDirFor(workspaceRoot, sessionId), PROJECT_SUBPATH)
}

/**
 * Build the user's home dir on first hello. Subsequent calls are no-ops so
 * any edits the user made are preserved across reconnects within the
 * cleanup grace period.
 */
export function ensureWorkspace(workspaceRoot: string, sessionId: string): {
  homeDir: string
  projectDir: string
} {
  const home = homeDirFor(workspaceRoot, sessionId)
  const project = projectDirFor(workspaceRoot, sessionId)

  if (existsSync(home)) {
    return { homeDir: home, projectDir: project }
  }

  if (!existsSync(GREETER_TEMPLATE)) {
    throw new Error(
      `template directory missing: ${GREETER_TEMPLATE}. did you delete apps/server/templates/?`
    )
  }

  // Create the standard top-level home folders so the file manager has
  // something to show beyond just the project. Empty by design — users
  // can create their own files via the terminal.
  mkdirSync(resolve(home, "Desktop"), { recursive: true })
  mkdirSync(resolve(home, "Documents"), { recursive: true })
  mkdirSync(resolve(home, "Downloads"), { recursive: true })
  mkdirSync(resolve(home, "projects"), { recursive: true })

  // Seed Documents with a friendly welcome note so the file manager
  // doesn't open empty.
  writeFileSync(
    resolve(home, "Documents", "welcome.md"),
    [
      "# welcome to dockerlab",
      "",
      "this is your private home directory.",
      "",
      "## projects",
      "",
      "you have two projects under ~/projects/:",
      "",
      "### greeter-api (start here)",
      "a tiny express API — one endpoint, one file.",
      "open the Dockerfile and fill in the `???` placeholders to",
      "learn the basics: FROM, WORKDIR, COPY, RUN, EXPOSE, CMD.",
      "",
      "### taskboard (full-stack challenge)",
      "a React + Express + MongoDB + Redis task board.",
      "write TWO Dockerfiles: one for the backend (TypeScript compile step),",
      "one for the frontend (multi-stage build: Node → nginx).",
      "then run everything with `docker compose up --build`.",
      "",
      "## solutions",
      "",
      "each project has a `solutions/` folder with the working Dockerfiles.",
      "try to write them yourself first! if you're stuck, peek at the answer.",
      "",
      "## getting started",
      "",
      "```",
      "cd projects/greeter-api",
      "code .                    # open in the editor",
      "cat TUTORIAL.md           # follow the step-by-step guide",
      "```",
      "",
      "each project has:",
      "- `README.md` — quick overview + reference",
      "- `TUTORIAL.md` — full step-by-step walkthrough",
      "- `Dockerfile` — your task (fill in the ???)",
      "- `solutions/` — working answers (try yourself first!)",
      "",
      "everything you create here lives only inside your session.",
      "when you disconnect, it gets cleaned up after a 90-second grace period.",
      "",
    ].join("\n"),
    "utf-8"
  )

  // Clone both project templates into projects/
  cpSync(GREETER_TEMPLATE, project, { recursive: true })
  if (existsSync(TASKBOARD_TEMPLATE)) {
    cpSync(
      TASKBOARD_TEMPLATE,
      resolve(home, "projects", "taskboard"),
      { recursive: true }
    )
  }

  return { homeDir: home, projectDir: project }
}

/**
 * Wipe a session's home directory and any docker artifacts. Called by the
 * cleanup sweep after the disconnect grace period expires.
 */
export function destroyWorkspace(workspaceRoot: string, sessionId: string): void {
  const dir = resolve(workspaceRoot, sessionId)
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true })
  }
}

// ─── port allocation ─────────────────────────────────────────────────────
//
// we hand out a 10-port slice per session starting at 30000. the user types
// `-p 3000:3000` but the host actually binds e.g. 30040:3000. we map the
// requested "guest port" to the next free slot in the user's slice.
//
// when the user reuses the same guest port across runs (the common case),
// they get the same host port back, so the browser preview keeps working
// without changing the URL.

const POOL_START = 30000
const SLICE_SIZE = 10

const sessionIndex = new Map<string, number>() // sessionId → slice index
const reservations = new Map<
  string, // sessionId
  Map<number, number> // guestPort → hostPort
>()
let nextSliceIndex = 0

function sliceFor(sessionId: string): number {
  let idx = sessionIndex.get(sessionId)
  if (idx === undefined) {
    idx = nextSliceIndex++
    sessionIndex.set(sessionId, idx)
  }
  return idx
}

/**
 * Allocate (or look up) the host port that backs `guestPort` for this
 * session. Returns null if the slice is full.
 */
export function reservePort(
  sessionId: string,
  guestPort: number
): number | null {
  let perSession = reservations.get(sessionId)
  if (!perSession) {
    perSession = new Map()
    reservations.set(sessionId, perSession)
  }
  const existing = perSession.get(guestPort)
  if (existing !== undefined) return existing

  const slice = sliceFor(sessionId)
  const sliceBase = POOL_START + slice * SLICE_SIZE
  for (let i = 0; i < SLICE_SIZE; i++) {
    const candidate = sliceBase + i
    // is anyone in this session already using `candidate` as a host port?
    let taken = false
    for (const [, host] of perSession) {
      if (host === candidate) {
        taken = true
        break
      }
    }
    if (!taken) {
      perSession.set(guestPort, candidate)
      return candidate
    }
  }
  return null
}

/** Drop a single port reservation (e.g. on `docker rm`). */
export function releasePort(sessionId: string, guestPort: number): void {
  reservations.get(sessionId)?.delete(guestPort)
}

/** Drop everything for a session (e.g. on disconnect cleanup). */
export function releaseAllPorts(sessionId: string): void {
  reservations.delete(sessionId)
  sessionIndex.delete(sessionId)
}

/** Look up an existing reservation without creating one. */
export function lookupHostPort(
  sessionId: string,
  guestPort: number
): number | undefined {
  return reservations.get(sessionId)?.get(guestPort)
}
