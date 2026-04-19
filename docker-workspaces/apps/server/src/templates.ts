// ─────────────────────────────────────────────────────────────────────────
// command template registry
//
// the template system is the heart of the security model. user-typed text
// never reaches a shell. instead:
//
//   1. the user's command is matched against a template's regex
//   2. captured groups are validated and bound to template parameters
//   3. the template returns a *concrete* argv array which we pass to spawn
//
// every template is responsible for:
//   • injecting --label session=<id> on every artifact it creates
//   • prefixing names with <id>- so users never collide
//   • rewriting -p host:guest mappings into the per-session port slice
//
// adding a new command means: add a new template object below.
// ─────────────────────────────────────────────────────────────────────────

import { existsSync } from "node:fs"
import { join } from "node:path"

import type { Session } from "./session"
import { releasePort, reservePort } from "./workspace"

export type TemplateMatch = {
  /** absolute path of the executable to run */
  bin: string
  /** argv array (no shell interpolation, ever) */
  args: string[]
  /** working directory */
  cwd?: string
  /** extra environment variables for the spawned process */
  env?: Record<string, string>
  /** soft kill timeout in ms */
  timeoutMs?: number
  /** optional message we want the user to see *before* the command runs */
  preface?: string
  /** optional message after the command finishes successfully */
  epilogue?: string
}

export type TemplateBuildResult =
  | { ok: true; cmd: TemplateMatch }
  | { ok: false; reason: string; hint?: string }

/**
 * Context handed to a template's `build()` callback. Carries the absolute
 * cwd resolved from the run request — docker templates that need a build
 * context (build, compose) read this so the user has to actually `cd` into
 * the project before the command works, like a real shell.
 */
export type BuildContext = {
  /** absolute path the user is currently `cd`'d into */
  requestCwd: string
}

export type Template = {
  /** human-readable name, used in error messages */
  name: string
  /** regex applied to the trimmed user input */
  match: RegExp
  /** build the concrete command for the matched session */
  build: (
    m: RegExpMatchArray,
    session: Session,
    ctx: BuildContext
  ) => TemplateBuildResult
}

// ─── helpers ─────────────────────────────────────────────────────────────

const NAME_RE = /^[a-z][a-z0-9-]{0,30}$/
const PORT_RE = /^\d{1,5}$/

/** prefix any user-supplied container/image name with the session id */
function prefixed(session: Session, name: string): string {
  return `${session.id}-${name}`
}

function isValidName(name: string): boolean {
  return NAME_RE.test(name)
}

function isValidPort(port: string): boolean {
  if (!PORT_RE.test(port)) return false
  const n = Number(port)
  return n > 0 && n < 65536
}

const SESSION_LABEL = (session: Session) => `session=${session.id}`

const RUNTIME_BIN = process.execPath

const APPLY_SOLUTION_SCRIPT = `
import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.env.SOLUTION_ROOT;
if (!root) {
  console.error("missing solution root");
  process.exit(1);
}

const copies = [
  [join(root, "solutions", "backend.Dockerfile"), join(root, "backend", "Dockerfile")],
  [join(root, "solutions", "frontend.Dockerfile"), join(root, "frontend", "Dockerfile")],
  [join(root, "solutions", "docker-compose.yml"), join(root, "docker-compose.yml")],
];

let copied = 0;
for (const [src, dst] of copies) {
  if (!existsSync(src)) continue;
  copyFileSync(src, dst);
  console.log(\`updated \${dst.split(/[\\\\/]/).slice(-2).join("/")}\`);
  copied += 1;
}

if (!copied) {
  console.error("no solution files found");
  process.exit(1);
}

console.log("");
console.log("Solution files copied into place.");
console.log("Next:");
console.log("  docker compose up --build");
`

const applySolution: Template = {
  name: "apply solution",
  match: /^(?:\.\/solution\.sh|bash\s+solution\.sh)\s*$/,
  build: (_m, _session, ctx) => {
    if (!existsSync(join(ctx.requestCwd, "solution.sh"))) {
      return {
        ok: false,
        reason: "no solution.sh in this folder",
        hint: "cd into the project root that contains solution.sh first",
      }
    }

    return {
      ok: true,
      cmd: {
        bin: RUNTIME_BIN,
        args: ["-e", APPLY_SOLUTION_SCRIPT],
        cwd: ctx.requestCwd,
        env: {
          SOLUTION_ROOT: ctx.requestCwd,
        },
        timeoutMs: 10_000,
      },
    }
  },
}

// ─── docker help ─────────────────────────────────────────────────────────

const dockerHelp: Template = {
  name: "docker help",
  match: /^docker\s*(?:--help|-h)?\s*$/,
  build: () => ({
    ok: true,
    cmd: {
      bin: "docker",
      args: ["--help"],
      timeoutMs: 5_000,
    },
  }),
}

const dockerComposeHelp: Template = {
  name: "docker compose help",
  match: /^docker\s+compose\s*(?:--help|-h)?\s*$/,
  build: () => ({
    ok: true,
    cmd: {
      bin: "docker",
      args: ["compose", "--help"],
      timeoutMs: 5_000,
    },
  }),
}

// ─── docker images ───────────────────────────────────────────────────────

const dockerImages: Template = {
  name: "docker images",
  match: /^docker\s+images\s*$/,
  build: (_m, session) => ({
    ok: true,
    cmd: {
      bin: "docker",
      args: [
        "images",
        "--filter",
        `label=${SESSION_LABEL(session)}`,
        "--format",
        "table {{.Repository}}\t{{.Tag}}\t{{.ID}}\t{{.CreatedSince}}\t{{.Size}}",
      ],
      timeoutMs: 5_000,
    },
  }),
}

// ─── docker ps (running) and docker ps -a (all) ──────────────────────────

const dockerPs: Template = {
  name: "docker ps",
  match: /^docker\s+ps(\s+-a)?\s*$/,
  build: (m, session) => {
    const all = m[1] !== undefined
    return {
      ok: true,
      cmd: {
        bin: "docker",
        args: [
          "ps",
          ...(all ? ["-a"] : []),
          "--filter",
          `label=${SESSION_LABEL(session)}`,
          "--format",
          "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}",
        ],
        timeoutMs: 5_000,
      },
    }
  },
}

// ─── docker build -t <name> . ────────────────────────────────────────────
//
// build context comes from the request cwd — i.e. wherever the user is
// `cd`'d into in their terminal. the user has to actually be in the
// project (or any folder containing a Dockerfile) for this to work,
// just like a real shell. if there's no Dockerfile, docker fails
// naturally with a clear error.

const dockerBuild: Template = {
  name: "docker build",
  match: /^docker\s+build\s+-t\s+([a-z][\w-]{0,30})\s+\.\s*$/,
  build: (m, session, ctx) => {
    const userName = m[1].toLowerCase()
    if (!isValidName(userName)) {
      return { ok: false, reason: `invalid image name: ${m[1]}` }
    }
    const fullName = prefixed(session, userName)
    return {
      ok: true,
      cmd: {
        bin: "docker",
        args: [
          "build",
          "-t",
          `${fullName}:latest`,
          "--label",
          SESSION_LABEL(session),
          // resource caps so a runaway build can't take down the demo
          "--memory",
          "512m",
          ctx.requestCwd,
        ],
        cwd: ctx.requestCwd,
        timeoutMs: 10 * 60_000, // 10 minutes — first build pulls the base image
        epilogue: `tagged as ${userName}:latest`,
      },
    }
  },
}

// ─── docker run -p host:guest <image> ────────────────────────────────────
//
// we accept either:
//   docker run -p 3000:3000 greeter
//   docker run -d -p 3000:3000 greeter
//
// host port is rewritten through the per-session pool. user types `3000`,
// container actually binds (e.g.) `30041`. the host port is what we report
// back so the user knows where to point their browser.

const dockerRun: Template = {
  name: "docker run",
  match:
    /^docker\s+run(?:\s+-d)?\s+-p\s+(\d{1,5}):(\d{1,5})\s+([a-z][\w-]{0,30})\s*$/,
  build: (m, session) => {
    const requestedHost = m[1]
    const guestPort = m[2]
    const userImage = m[3].toLowerCase()
    if (!isValidPort(requestedHost) || !isValidPort(guestPort)) {
      return { ok: false, reason: "ports must be between 1 and 65535" }
    }
    if (!isValidName(userImage)) {
      return { ok: false, reason: `invalid image name: ${m[3]}` }
    }

    const guestPortNum = Number(guestPort)
    const allocated = reservePort(session.id, guestPortNum)
    if (allocated === null) {
      return {
        ok: false,
        reason: "your port slice is full — `docker rm` something first",
      }
    }

    const fullImage = prefixed(session, userImage)
    const containerName = prefixed(session, userImage)

    return {
      ok: true,
      cmd: {
        bin: "docker",
        args: [
          "run",
          "-d", // always detached so the websocket isn't blocked
          "--rm", // auto-cleanup on stop, simpler lifecycle
          "--name",
          containerName,
          "--label",
          SESSION_LABEL(session),
          "-p",
          `${allocated}:${guestPort}`,
          // resource caps
          "--memory",
          "256m",
          "--cpus",
          "0.5",
          "--pids-limit",
          "100",
          `${fullImage}:latest`,
        ],
        timeoutMs: 30_000,
        // We deliberately echo the user's requested port instead of the
        // real allocated host port. The browser app translates localhost
        // URLs through `lookup_port` so the user never has to think about
        // the per-session port pool.
        epilogue: `→ http://localhost:${requestedHost}`,
      },
    }
  },
}

// ─── docker stop <name> ──────────────────────────────────────────────────

const dockerStop: Template = {
  name: "docker stop",
  match: /^docker\s+stop\s+([a-z][\w-]{0,30})\s*$/,
  build: (m, session) => {
    const userName = m[1].toLowerCase()
    if (!isValidName(userName)) {
      return { ok: false, reason: `invalid container name: ${m[1]}` }
    }
    return {
      ok: true,
      cmd: {
        bin: "docker",
        args: ["stop", prefixed(session, userName)],
        timeoutMs: 30_000,
        epilogue: "stopped",
      },
    }
  },
}

// ─── docker rm <name> ────────────────────────────────────────────────────
//
// because run uses --rm, this is mostly a no-op for running containers.
// but stopped containers (-a) still hang around if they crashed, so we
// keep this for cleanup.

const dockerRm: Template = {
  name: "docker rm",
  match: /^docker\s+rm\s+(-f\s+)?([a-z][\w-]{0,30})\s*$/,
  build: (m, session) => {
    const force = m[1] !== undefined
    const userName = m[2].toLowerCase()
    if (!isValidName(userName)) {
      return { ok: false, reason: `invalid container name: ${m[2]}` }
    }
    return {
      ok: true,
      cmd: {
        bin: "docker",
        args: ["rm", ...(force ? ["-f"] : []), prefixed(session, userName)],
        timeoutMs: 30_000,
      },
    }
  },
}

// ─── docker rmi <name> ───────────────────────────────────────────────────

const dockerRmi: Template = {
  name: "docker rmi",
  match: /^docker\s+rmi\s+([a-z][\w-]{0,30})\s*$/,
  build: (m, session) => {
    const userName = m[1].toLowerCase()
    if (!isValidName(userName)) {
      return { ok: false, reason: `invalid image name: ${m[1]}` }
    }
    return {
      ok: true,
      cmd: {
        bin: "docker",
        args: ["rmi", `${prefixed(session, userName)}:latest`],
        timeoutMs: 15_000,
      },
    }
  },
}

// ─── docker logs [-f] <name> ─────────────────────────────────────────────
//
// `-f` (follow) is a long-running command that streams forever. the
// frontend's cancel button issues a `cancel` message which the executor
// translates into proc.kill() — see index.ts activeProcs map.

const dockerLogs: Template = {
  name: "docker logs",
  match: /^docker\s+logs(\s+-f)?\s+([a-z][\w-]{0,30})\s*$/,
  build: (m, session) => {
    const follow = m[1] !== undefined
    const userName = m[2].toLowerCase()
    if (!isValidName(userName)) {
      return { ok: false, reason: `invalid container name: ${m[2]}` }
    }
    return {
      ok: true,
      cmd: {
        bin: "docker",
        args: [
          "logs",
          "--tail",
          "200",
          ...(follow ? ["-f"] : []),
          prefixed(session, userName),
        ],
        // follow mode has no timeout; the user cancels with the cancel button
        timeoutMs: follow ? undefined : 5_000,
      },
    }
  },
}

// ─── docker inspect <name> ───────────────────────────────────────────────

const dockerInspect: Template = {
  name: "docker inspect",
  match: /^docker\s+inspect\s+([a-z][\w-]{0,30})\s*$/,
  build: (m, session) => {
    const userName = m[1].toLowerCase()
    if (!isValidName(userName)) {
      return { ok: false, reason: `invalid name: ${m[1]}` }
    }
    return {
      ok: true,
      cmd: {
        bin: "docker",
        args: ["inspect", prefixed(session, userName)],
        timeoutMs: 10_000,
      },
    }
  },
}

// ─── docker compose ──────────────────────────────────────────────────────
//
// every compose call is namespaced with `-p <sessionId>` so multiple
// users running the same compose file get distinct project stacks. the
// project directory is wherever the user is `cd`'d into when they run
// the command — they have to be in a folder with a docker-compose.yml,
// just like a real shell.

function composeBaseArgs(session: Session, requestCwd: string): string[] {
  return [
    "compose",
    "-p",
    session.id,
    "--project-directory",
    requestCwd,
    "-f",
    join(requestCwd, "docker-compose.yml"),
  ]
}

const COMPOSE_ALLOWED_UP_FLAGS = new Set([
  "-d",
  "--build",
  "--remove-orphans",
  "--force-recreate",
  "--no-build",
  "--pull=always",
  "--pull=missing",
  "--pull=never",
])

function parseComposeUpFlags(
  raw: string
):
  | { ok: true; flags: string[] }
  | { ok: false; reason: string; hint?: string } {
  const flags = raw.trim() ? raw.trim().split(/\s+/) : []
  for (const flag of flags) {
    if (!COMPOSE_ALLOWED_UP_FLAGS.has(flag)) {
      return {
        ok: false,
        reason: `unsupported compose flag: ${flag}`,
        hint: "try `docker compose up --build`, `docker compose up -d --build`, or `docker compose down -v`",
      }
    }
  }
  return { ok: true, flags }
}

const dockerComposeUp: Template = {
  name: "docker compose up",
  match:
    /^docker\s+compose\s+up((?:\s+(?:-d|--build|--remove-orphans|--force-recreate|--no-build|--pull=(?:always|missing|never)))*)\s*$/,
  build: (m, session, ctx) => {
    const parsed = parseComposeUpFlags(m[1] ?? "")
    if (!parsed.ok) return parsed

    const webPort = reservePort(session.id, 8080)
    if (webPort === null) {
      return {
        ok: false,
        reason:
          "your port slice is full - `docker compose down` something first",
      }
    }

    return {
      ok: true,
      cmd: {
        bin: "docker",
        args: [
          ...composeBaseArgs(session, ctx.requestCwd),
          "up",
          "-d", // always detached so the websocket isn't blocked
          ...parsed.flags.filter((flag) => flag !== "-d"),
        ],
        cwd: ctx.requestCwd,
        env: {
          WEB_PORT: String(webPort),
        },
        timeoutMs: 10 * 60_000,
        epilogue:
          "stack up - try `docker compose ps`, then open http://localhost:8080",
      },
    }
  },
}

const dockerComposeDown: Template = {
  name: "docker compose down",
  match: /^docker\s+compose\s+down(\s+(?:-v|--volumes))?\s*$/,
  build: (m, session, ctx) => {
    const wipeVolumes = m[1] !== undefined
    releasePort(session.id, 8080)
    return {
      ok: true,
      cmd: {
        bin: "docker",
        args: [
          ...composeBaseArgs(session, ctx.requestCwd),
          "down",
          ...(wipeVolumes ? ["-v"] : []),
        ],
        cwd: ctx.requestCwd,
        timeoutMs: 60_000,
      },
    }
  },
}

const dockerComposePs: Template = {
  name: "docker compose ps",
  match: /^docker\s+compose\s+ps\s*$/,
  build: (_m, session, ctx) => ({
    ok: true,
    cmd: {
      bin: "docker",
      args: [...composeBaseArgs(session, ctx.requestCwd), "ps"],
      cwd: ctx.requestCwd,
      timeoutMs: 10_000,
    },
  }),
}

const dockerComposeBuild: Template = {
  name: "docker compose build",
  match: /^docker\s+compose\s+build\s*$/,
  build: (_m, session, ctx) => ({
    ok: true,
    cmd: {
      bin: "docker",
      args: [...composeBaseArgs(session, ctx.requestCwd), "build"],
      cwd: ctx.requestCwd,
      timeoutMs: 10 * 60_000,
    },
  }),
}

const dockerComposeLogs: Template = {
  name: "docker compose logs",
  match:
    /^docker\s+compose\s+logs(\s+-f)?(\s+--tail=\d{1,4})?(?:\s+([a-z][a-z0-9-]{0,30}))?\s*$/,
  build: (m, session, ctx) => {
    const tailMatch = m[0].match(/--tail=(\d{1,4})/)
    const follow = m[1] !== undefined
    const tail = tailMatch ? tailMatch[1] : "200"
    const service = m[3]
    return {
      ok: true,
      cmd: {
        bin: "docker",
        args: [
          ...composeBaseArgs(session, ctx.requestCwd),
          "logs",
          "--tail",
          tail,
          ...(follow ? ["-f"] : []),
          ...(service ? [service] : []),
        ],
        cwd: ctx.requestCwd,
        timeoutMs: follow ? undefined : 10_000,
      },
    }
  },
}

// ─── registry ────────────────────────────────────────────────────────────
//
// order matters: we try templates top-to-bottom and return the first match.
// keep more-specific patterns before more-general ones if they ever overlap.

// order matters: more specific patterns (compose) come before more general
// ones (`docker run` etc) — though they don't actually overlap, having
// compose first makes the registry easier to scan.
export const TEMPLATES: Template[] = [
  applySolution,
  dockerHelp,
  dockerComposeHelp,
  dockerImages,
  dockerPs,
  dockerBuild,
  dockerRun,
  dockerStop,
  dockerRm,
  dockerRmi,
  dockerLogs,
  dockerInspect,
  dockerComposeUp,
  dockerComposeDown,
  dockerComposePs,
  dockerComposeBuild,
  dockerComposeLogs,
]

export function matchTemplate(
  input: string
): { template: Template; match: RegExpMatchArray } | null {
  const trimmed = input.trim().replace(/^docker-compose\b/, "docker compose")
  for (const template of TEMPLATES) {
    const m = trimmed.match(template.match)
    if (m) return { template, match: m }
  }
  return null
}

// ─── port release on rm ──────────────────────────────────────────────────
//
// when a user removes a container, we need to release its port reservation
// so they can run another. but our templates only know names, not ports.
// the dispatcher in index.ts calls this *after* a successful rm/stop to
// keep the slice tidy. for now we just clear all reservations on a rm
// targeting a known container — good enough for the demo.

export function releasePortsForName(session: Session, name: string): void {
  // we don't track which guest port belongs to which container, so the
  // simplest correct behaviour is: when a user removes a container, free
  // the port they most likely meant. since the demo only uses 3000, this
  // is fine. a richer implementation would parse `docker inspect` output.
  releasePort(session.id, 3000)
  // silence linter when name is unused
  void name
}
