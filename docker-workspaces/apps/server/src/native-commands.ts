// ─────────────────────────────────────────────────────────────────────────
// native shell-like commands (cd, ls, cat, mkdir, rm, …)
//
// these are the "non-docker" commands the terminal supports. they DON'T
// shell out — every handler runs entirely in node and returns a synchronous
// result that the index.ts run handler streams back as a normal `done`.
//
// no shell interpolation ever reaches the OS:
//   • the user's command is split with a tiny argv tokenizer
//   • each handler validates its args
//   • file paths flow through files.ts safePath() which containment-checks
//     against the session's home directory
//
// commands that *change* state (cd) return a `cwdUpdate` field on done so
// the client adopts the new cwd. otherwise the client's local cwd would
// drift from the server's view.
//
// out of scope: pipes, redirection, globs, env vars, command substitution.
// the demo doesn't need any of those, and adding them would multiply the
// security surface for no benefit.
// ─────────────────────────────────────────────────────────────────────────

import { statSync } from "node:fs"
import { resolve as pathResolve, sep } from "node:path"

import {
  cpSafe,
  listDirectory,
  mkdirSafe,
  mvSafe,
  readFileSafe,
  relativeToHome,
  rmSafe,
  safePath,
  statSafe,
  touchSafe,
} from "./files"
import type { Session } from "./session"

export type NativeResult = {
  /** lines to send back as stdout */
  stdout: string
  /** lines to send back as stderr */
  stderr: string
  /** process-style exit code */
  exitCode: number
  /**
   * If this command changed cwd, the new cwd as a path *relative to home*.
   * The client adopts it as its terminal cwd. Absent for read-only commands.
   */
  cwdUpdate?: string
}

/**
 * The terminal cwd as the *client* sees it: a path relative to home, with
 * forward slashes, no leading slash. Empty string means home itself.
 */
export type ClientCwd = string

/**
 * Tokenize a command line into argv. We support double-quoted segments so
 * paths with spaces work, but nothing fancier (no escape sequences, no
 * single quotes, no env var expansion).
 */
export function tokenize(input: string): string[] {
  const out: string[] = []
  let i = 0
  while (i < input.length) {
    const ch = input[i]
    if (ch === " " || ch === "\t") {
      i++
      continue
    }
    if (ch === '"') {
      // double-quoted segment
      i++
      let buf = ""
      while (i < input.length && input[i] !== '"') {
        buf += input[i++]
      }
      if (input[i] === '"') i++
      out.push(buf)
      continue
    }
    let buf = ""
    while (i < input.length && input[i] !== " " && input[i] !== "\t") {
      buf += input[i++]
    }
    out.push(buf)
  }
  return out
}

/** The set of command names native handlers will respond to. */
const NATIVE_COMMANDS = new Set([
  "cd",
  "pwd",
  "ls",
  "ll",
  "cat",
  "mkdir",
  "rm",
  "rmdir",
  "touch",
  "cp",
  "mv",
  "echo",
  "whoami",
  "help",
])

export function isNativeCommand(input: string): boolean {
  const argv = tokenize(input.trim())
  if (argv.length === 0) return false
  return NATIVE_COMMANDS.has(argv[0])
}

/**
 * Run a native command for `session`, with the terminal currently at
 * `clientCwd` (relative to home). Returns a NativeResult to be streamed
 * back, or null if the command isn't a native one (caller falls through
 * to the docker template registry).
 */
export function runNative(
  session: Session,
  clientCwd: ClientCwd,
  input: string
): NativeResult | null {
  const argv = tokenize(input.trim())
  if (argv.length === 0) return null
  const cmd = argv[0]
  const args = argv.slice(1)
  if (!NATIVE_COMMANDS.has(cmd)) return null

  switch (cmd) {
    case "cd":
      return cmdCd(session, clientCwd, args)
    case "pwd":
      return cmdPwd(clientCwd)
    case "ls":
    case "ll":
      return cmdLs(session, clientCwd, args, cmd === "ll")
    case "cat":
      return cmdCat(session, clientCwd, args)
    case "mkdir":
      return cmdMkdir(session, clientCwd, args)
    case "rm":
      return cmdRm(session, clientCwd, args)
    case "rmdir":
      return cmdRmdir(session, clientCwd, args)
    case "touch":
      return cmdTouch(session, clientCwd, args)
    case "cp":
      return cmdCp(session, clientCwd, args)
    case "mv":
      return cmdMv(session, clientCwd, args)
    case "echo":
      return cmdEcho(args)
    case "whoami":
      return ok(`${session.username}\n`)
    case "help":
      return cmdHelp()
  }
  return null
}

// ─── helpers ─────────────────────────────────────────────────────────────

function ok(stdout: string, cwdUpdate?: string): NativeResult {
  return { stdout, stderr: "", exitCode: 0, cwdUpdate }
}

function err(message: string): NativeResult {
  return { stdout: "", stderr: `${message}\n`, exitCode: 1 }
}

/**
 * Resolve a user-supplied path against the client's current cwd, then
 * convert to a path relative to home. Returns null if the path escapes
 * the home directory.
 *
 * Examples (with clientCwd = "projects/greeter-api"):
 *   "."        → "projects/greeter-api"
 *   ".."       → "projects"
 *   "../.."    → ""
 *   "/Desktop" → "Desktop"
 *   "~"        → ""
 *   "src"      → "projects/greeter-api/src"
 */
function resolveRelative(
  session: Session,
  clientCwd: ClientCwd,
  target: string
): string | null {
  // Absolute / home-anchored paths reset to home
  let normalized = target
  if (
    normalized === "~" ||
    normalized.startsWith("~/") ||
    normalized.startsWith("~\\")
  ) {
    normalized = normalized.slice(1).replace(/^[/\\]+/, "")
    return safeRelative(session, normalized)
  }
  if (normalized.startsWith("/") || normalized.startsWith("\\")) {
    normalized = normalized.replace(/^[/\\]+/, "")
    return safeRelative(session, normalized)
  }
  // Relative path: join with clientCwd
  const joined = clientCwd ? `${clientCwd}/${normalized}` : normalized
  return safeRelative(session, joined)
}

/**
 * Take a path that's already meant to be relative-to-home, normalize it
 * (handle ../, ./), validate containment, and return the canonical
 * relative-to-home form. Null if it escapes.
 */
function safeRelative(session: Session, relish: string): string | null {
  const absolute = pathResolve(session.homeDir, relish)
  const root = session.homeDir.endsWith(sep)
    ? session.homeDir
    : session.homeDir + sep
  if (absolute !== session.homeDir && !absolute.startsWith(root)) {
    return null
  }
  return relativeToHome(session, absolute)
}

/** "" → "~", "Desktop" → "~/Desktop". */
function displayCwd(rel: ClientCwd): string {
  return rel ? `~/${rel}` : "~"
}

// ─── command handlers ───────────────────────────────────────────────────

function cmdCd(
  session: Session,
  clientCwd: ClientCwd,
  args: string[]
): NativeResult {
  const target = args[0] ?? ""
  if (!target || target === "~") {
    return ok("", "")
  }
  if (target === "-") {
    return err("cd: OLDPWD not set")
  }
  const next = resolveRelative(session, clientCwd, target)
  if (next === null) {
    return err(`cd: ${target}: outside home`)
  }
  // Verify it actually exists and is a directory
  const stat = statSafe(session, next)
  if ("error" in stat) return err(`cd: ${target}: ${stat.error}`)
  if (stat.kind === "missing") {
    return err(`cd: ${target}: no such file or directory`)
  }
  if (stat.kind !== "dir") {
    return err(`cd: ${target}: not a directory`)
  }
  return ok("", next)
}

function cmdPwd(clientCwd: ClientCwd): NativeResult {
  return ok(`${displayCwd(clientCwd)}\n`)
}

function cmdLs(
  session: Session,
  clientCwd: ClientCwd,
  args: string[],
  longFormat: boolean
): NativeResult {
  // Drop any flags. We support -l, -a (no-op since we don't hide dotfiles
  // beyond .git/node_modules already filtered server-side), -la, -al.
  const positional: string[] = []
  let asLong = longFormat
  for (const a of args) {
    if (a.startsWith("-")) {
      if (a.includes("l")) asLong = true
    } else {
      positional.push(a)
    }
  }
  const target = positional[0] ?? "."
  const resolved = resolveRelative(session, clientCwd, target)
  if (resolved === null) return err(`ls: ${target}: outside home`)
  const result = listDirectory(session, resolved)
  if ("error" in result) return err(`ls: ${target}: ${result.error}`)

  if (asLong) {
    // long format with type marker — kept simple, no perms or sizes
    const lines = result.entries.map(
      (e) => `${e.type === "dir" ? "d" : "-"}  ${e.name}${e.type === "dir" ? "/" : ""}`
    )
    return ok(lines.join("\n") + (lines.length ? "\n" : ""))
  }

  // grid-ish: just space-separated names with a trailing slash for dirs
  const tokens = result.entries.map((e) =>
    e.type === "dir" ? `${e.name}/` : e.name
  )
  return ok(tokens.join("  ") + (tokens.length ? "\n" : ""))
}

function cmdCat(
  session: Session,
  clientCwd: ClientCwd,
  args: string[]
): NativeResult {
  if (args.length === 0) return err("cat: missing operand")
  const out: string[] = []
  for (const a of args) {
    const r = resolveRelative(session, clientCwd, a)
    if (r === null) return err(`cat: ${a}: outside home`)
    const file = readFileSafe(session, r)
    if ("error" in file) return err(`cat: ${a}: ${file.error}`)
    out.push(file.content)
  }
  // ensure trailing newline so the next prompt isn't glued to the last line
  let combined = out.join("")
  if (combined.length > 0 && !combined.endsWith("\n")) combined += "\n"
  return ok(combined)
}

function cmdMkdir(
  session: Session,
  clientCwd: ClientCwd,
  args: string[]
): NativeResult {
  let recursive = false
  const positional: string[] = []
  for (const a of args) {
    if (a === "-p" || a === "--parents") recursive = true
    else if (a.startsWith("-")) return err(`mkdir: unknown flag ${a}`)
    else positional.push(a)
  }
  if (positional.length === 0) return err("mkdir: missing operand")
  for (const a of positional) {
    const r = resolveRelative(session, clientCwd, a)
    if (r === null) return err(`mkdir: ${a}: outside home`)
    const result = mkdirSafe(session, r, { recursive })
    if ("error" in result) return err(`mkdir: ${a}: ${result.error}`)
  }
  return ok("")
}

function cmdRm(
  session: Session,
  clientCwd: ClientCwd,
  args: string[]
): NativeResult {
  let recursive = false
  let force = false
  const positional: string[] = []
  for (const a of args) {
    if (a === "-r" || a === "-R" || a === "--recursive") recursive = true
    else if (a === "-f" || a === "--force") force = true
    else if (a === "-rf" || a === "-fr" || a === "-Rf" || a === "-fR") {
      recursive = true
      force = true
    } else if (a.startsWith("-")) return err(`rm: unknown flag ${a}`)
    else positional.push(a)
  }
  if (positional.length === 0) return err("rm: missing operand")
  for (const a of positional) {
    const r = resolveRelative(session, clientCwd, a)
    if (r === null) return err(`rm: ${a}: outside home`)
    const result = rmSafe(session, r, { recursive, force })
    if ("error" in result) return err(`rm: ${a}: ${result.error}`)
  }
  return ok("")
}

function cmdRmdir(
  session: Session,
  clientCwd: ClientCwd,
  args: string[]
): NativeResult {
  if (args.length === 0) return err("rmdir: missing operand")
  for (const a of args) {
    const r = resolveRelative(session, clientCwd, a)
    if (r === null) return err(`rmdir: ${a}: outside home`)
    // verify it's actually a dir before removing
    const s = statSafe(session, r)
    if ("error" in s) return err(`rmdir: ${a}: ${s.error}`)
    if (s.kind !== "dir") return err(`rmdir: ${a}: not a directory`)
    const result = rmSafe(session, r)
    if ("error" in result) return err(`rmdir: ${a}: ${result.error}`)
  }
  return ok("")
}

function cmdTouch(
  session: Session,
  clientCwd: ClientCwd,
  args: string[]
): NativeResult {
  if (args.length === 0) return err("touch: missing operand")
  for (const a of args) {
    const r = resolveRelative(session, clientCwd, a)
    if (r === null) return err(`touch: ${a}: outside home`)
    const result = touchSafe(session, r)
    if ("error" in result) return err(`touch: ${a}: ${result.error}`)
  }
  return ok("")
}

function cmdCp(
  session: Session,
  clientCwd: ClientCwd,
  args: string[]
): NativeResult {
  let recursive = false
  const positional: string[] = []
  for (const a of args) {
    if (a === "-r" || a === "-R" || a === "--recursive") recursive = true
    else if (a.startsWith("-")) return err(`cp: unknown flag ${a}`)
    else positional.push(a)
  }
  if (positional.length < 2) return err("cp: missing destination")
  const dest = positional[positional.length - 1]
  const sources = positional.slice(0, -1)
  // If dest is an existing directory, copy each source *into* it.
  const destResolved = resolveRelative(session, clientCwd, dest)
  if (destResolved === null) return err(`cp: ${dest}: outside home`)
  const destAbs = safePath(session, destResolved)
  if (!destAbs) return err(`cp: ${dest}: invalid path`)
  let destIsDir = false
  try {
    destIsDir = statSync(destAbs).isDirectory()
  } catch {
    /* noop — dest doesn't exist yet, treat as file rename */
  }
  for (const src of sources) {
    const srcRel = resolveRelative(session, clientCwd, src)
    if (srcRel === null) return err(`cp: ${src}: outside home`)
    const finalDest = destIsDir
      ? `${destResolved}/${baseName(src)}`
      : destResolved
    const result = cpSafe(session, srcRel, finalDest, { recursive })
    if ("error" in result) return err(`cp: ${src}: ${result.error}`)
  }
  return ok("")
}

function cmdMv(
  session: Session,
  clientCwd: ClientCwd,
  args: string[]
): NativeResult {
  if (args.length < 2) return err("mv: missing destination")
  const dest = args[args.length - 1]
  const sources = args.slice(0, -1)
  const destResolved = resolveRelative(session, clientCwd, dest)
  if (destResolved === null) return err(`mv: ${dest}: outside home`)
  const destAbs = safePath(session, destResolved)
  if (!destAbs) return err(`mv: ${dest}: invalid path`)
  let destIsDir = false
  try {
    destIsDir = statSync(destAbs).isDirectory()
  } catch {
    /* dest may not exist; treat as rename */
  }
  for (const src of sources) {
    const srcRel = resolveRelative(session, clientCwd, src)
    if (srcRel === null) return err(`mv: ${src}: outside home`)
    const finalDest = destIsDir
      ? `${destResolved}/${baseName(src)}`
      : destResolved
    const result = mvSafe(session, srcRel, finalDest)
    if ("error" in result) return err(`mv: ${src}: ${result.error}`)
  }
  return ok("")
}

function cmdEcho(args: string[]): NativeResult {
  return ok(args.join(" ") + "\n")
}

function cmdHelp(): NativeResult {
  const lines = [
    "available commands:",
    "",
    "  filesystem:",
    "    cd <path>           change directory",
    "    pwd                 print working directory",
    "    ls [path]           list directory contents",
    "    cat <file>          print file contents",
    "    mkdir [-p] <path>   create directory",
    "    rm [-rf] <path>     remove file or directory",
    "    touch <file>        create empty file",
    "    cp [-r] <src> <dst> copy",
    "    mv <src> <dst>      move / rename",
    "",
    "  ui:",
    "    code [path]         open file or folder in the code app",
    "    clear               clear the terminal",
    "",
    "  docker (any standard docker command):",
    "    docker build, docker run, docker ps, docker images,",
    "    docker logs, docker stop, docker rm, docker compose …",
    "",
  ]
  return ok(lines.join("\n"))
}

function baseName(path: string): string {
  const cleaned = path.replace(/[/\\]+$/, "")
  const idx = Math.max(cleaned.lastIndexOf("/"), cleaned.lastIndexOf("\\"))
  return idx >= 0 ? cleaned.slice(idx + 1) : cleaned
}
