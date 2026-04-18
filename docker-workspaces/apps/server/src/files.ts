// ─────────────────────────────────────────────────────────────────────────
// per-session filesystem access
//
// the files app, code app, and terminal native commands all talk to the
// user's *real* home directory on disk:
//   apps/server/workspaces/<sessionId>/home/
//
// every path the client sends is treated as relative to that home root.
// we resolve it absolutely and *verify* that the result still lives
// inside the home before touching disk — this is the only thing stopping
// a malicious client from typing "../../../etc/passwd".
// ─────────────────────────────────────────────────────────────────────────

import {
  cpSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { resolve, sep } from "node:path"

import type { DirEntry } from "@workspace/protocol"

import type { Session } from "./session"

const MAX_FILE_BYTES = 1_000_000 // 1 MB
const HIDDEN = new Set([".git", "node_modules", ".DS_Store"])

export type FilesError = { error: string }

/**
 * Resolve a client-supplied path against the session's home directory and
 * confirm it doesn't escape. Returns null if the path is malicious or the
 * home dir is missing. Exported because the native command handlers
 * (`cd`, `mkdir`, `rm`, …) all need the same containment check.
 */
export function safePath(session: Session, requested: string): string | null {
  // Strip any leading slashes/backslashes/dots so a client can't sneak
  // through `/etc/passwd` or `..\..\..\windows`. We also normalize a
  // leading `~` to the home root since the user thinks of it that way.
  let cleaned = requested
  if (cleaned === "~" || cleaned.startsWith("~/") || cleaned.startsWith("~\\")) {
    cleaned = cleaned.slice(1)
  }
  cleaned = cleaned.replace(/^[/\\]+/, "")
  if (!cleaned || cleaned === "." || cleaned === "./") {
    return session.homeDir
  }
  const absolute = resolve(session.homeDir, cleaned)
  // Containment check: the absolute resolved path must equal the home root
  // OR start with the home root + a path separator. We add the trailing
  // separator to both sides first so `/foo/bar2` doesn't accidentally
  // match against `/foo/bar`.
  const root = session.homeDir.endsWith(sep)
    ? session.homeDir
    : session.homeDir + sep
  if (absolute !== session.homeDir && !absolute.startsWith(root)) {
    return null
  }
  return absolute
}

/**
 * Convert an absolute path back into a path *relative to home*, with
 * forward slashes regardless of OS. Used by the native command handlers
 * to report cwd back to the client. Returns "" for the home root itself.
 */
export function relativeToHome(session: Session, absolute: string): string {
  if (absolute === session.homeDir) return ""
  const root = session.homeDir.endsWith(sep)
    ? session.homeDir
    : session.homeDir + sep
  if (!absolute.startsWith(root)) return ""
  return absolute.slice(root.length).replaceAll(sep, "/")
}

export function listDirectory(
  session: Session,
  path: string
): { entries: DirEntry[] } | FilesError {
  const dir = safePath(session, path)
  if (!dir) return { error: "invalid path" }
  try {
    const stat = statSync(dir)
    if (!stat.isDirectory()) return { error: "not a directory" }
    const entries: DirEntry[] = readdirSync(dir, { withFileTypes: true })
      .filter((e) => !HIDDEN.has(e.name))
      .map((e) => ({
        name: e.name,
        type: e.isDirectory() ? ("dir" as const) : ("file" as const),
      }))
      // dirs first, then alphabetical
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === "dir" ? -1 : 1
        return a.name.localeCompare(b.name)
      })
    return { entries }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

export function readFileSafe(
  session: Session,
  path: string
): { content: string; language: string } | FilesError {
  const file = safePath(session, path)
  if (!file) return { error: "invalid path" }
  try {
    const stat = statSync(file)
    if (!stat.isFile()) return { error: "not a file" }
    if (stat.size > MAX_FILE_BYTES) return { error: "file too large" }
    const content = readFileSync(file, "utf-8")
    return { content, language: languageOf(path) }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

export function writeFileSafe(
  session: Session,
  path: string,
  content: string
): { ok: true } | FilesError {
  const file = safePath(session, path)
  if (!file) return { error: "invalid path" }
  if (content.length > MAX_FILE_BYTES) return { error: "file too large" }
  try {
    writeFileSync(file, content, "utf-8")
    return { ok: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

// ─── shell-style helpers used by native command handlers ─────────────────

export function statSafe(
  session: Session,
  path: string
): { kind: "file" | "dir" | "missing" } | FilesError {
  const target = safePath(session, path)
  if (!target) return { error: "invalid path" }
  try {
    const s = statSync(target)
    return { kind: s.isDirectory() ? "dir" : "file" }
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") {
      return { kind: "missing" }
    }
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

export function mkdirSafe(
  session: Session,
  path: string,
  options: { recursive?: boolean } = {}
): { ok: true } | FilesError {
  const target = safePath(session, path)
  if (!target) return { error: "invalid path" }
  try {
    mkdirSync(target, { recursive: options.recursive ?? false })
    return { ok: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

export function rmSafe(
  session: Session,
  path: string,
  options: { recursive?: boolean; force?: boolean } = {}
): { ok: true } | FilesError {
  const target = safePath(session, path)
  if (!target) return { error: "invalid path" }
  // never let the user delete the home root itself
  if (target === session.homeDir) {
    return { error: "refusing to remove home" }
  }
  try {
    rmSync(target, {
      recursive: options.recursive ?? false,
      force: options.force ?? false,
    })
    return { ok: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

export function touchSafe(
  session: Session,
  path: string
): { ok: true } | FilesError {
  const target = safePath(session, path)
  if (!target) return { error: "invalid path" }
  try {
    // open with `wx` flag would fail if it exists; we want touch semantics
    // (create if missing, otherwise leave alone). The simplest way without
    // a race is: try to open `a` (append, create) which never truncates.
    writeFileSync(target, "", { flag: "a" })
    return { ok: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

export function cpSafe(
  session: Session,
  src: string,
  dest: string,
  options: { recursive?: boolean } = {}
): { ok: true } | FilesError {
  const a = safePath(session, src)
  const b = safePath(session, dest)
  if (!a || !b) return { error: "invalid path" }
  try {
    cpSync(a, b, { recursive: options.recursive ?? false })
    return { ok: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

export function mvSafe(
  session: Session,
  src: string,
  dest: string
): { ok: true } | FilesError {
  const a = safePath(session, src)
  const b = safePath(session, dest)
  if (!a || !b) return { error: "invalid path" }
  if (a === session.homeDir) return { error: "refusing to move home" }
  try {
    renameSync(a, b)
    return { ok: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

function languageOf(path: string): string {
  const lower = path.toLowerCase()
  if (lower.endsWith("dockerfile") || lower.endsWith(".dockerfile")) {
    return "dockerfile"
  }
  if (lower.endsWith(".js") || lower.endsWith(".mjs") || lower.endsWith(".cjs")) {
    return "javascript"
  }
  if (lower.endsWith(".ts") || lower.endsWith(".tsx")) return "typescript"
  if (lower.endsWith(".json")) return "json"
  if (lower.endsWith(".yml") || lower.endsWith(".yaml")) return "yaml"
  if (lower.endsWith(".md")) return "markdown"
  if (lower.endsWith(".env") || lower.includes(".dockerignore")) return "ini"
  return "plaintext"
}
