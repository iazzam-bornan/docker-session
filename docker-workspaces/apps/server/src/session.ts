// ─────────────────────────────────────────────────────────────────────────
// session manager
//
// each connected user gets a Session. the session id is derived from the
// chosen username so reconnecting from the same browser tab resumes the same
// session (no state loss between flaky network blips).
//
// the project workspace is cloned from apps/server/templates/greeter-api on
// first hello. ports are handed out by workspace.ts on demand.
// ─────────────────────────────────────────────────────────────────────────

import type { ServerWebSocket } from "bun"

import { destroyWorkspace, ensureWorkspace } from "./workspace"

export type Session = {
  /** opaque id used to label all docker artifacts */
  id: string
  username: string
  /** absolute path of the user's *home directory* on the server */
  homeDir: string
  /**
   * absolute path of the demo project (greeter-api) inside the home dir.
   * cached so docker build/compose don't have to recompute it.
   */
  projectDir: string
  createdAt: number
  /** the live websocket for this session, if any */
  socket?: ServerWebSocket<SocketData>
}

/** Per-socket attachment used by Bun.serve's websocket handler. */
export type SocketData = {
  sessionId: string | null
}

const sessions = new Map<string, Session>()

/** Sanitize a username into something safe to use in docker labels and paths. */
function sanitize(username: string): string {
  return username
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24) || "anon"
}

export function getOrCreateSession(username: string, workspaceRoot: string): Session {
  const id = sanitize(username)
  const existing = sessions.get(id)
  if (existing) return existing

  // Build the user's home dir on first hello. Returns both the home root
  // (the user's "filesystem") and the project subdir (docker build cwd).
  const { homeDir, projectDir } = ensureWorkspace(workspaceRoot, id)

  const session: Session = {
    id,
    username,
    homeDir,
    projectDir,
    createdAt: Date.now(),
  }
  sessions.set(id, session)
  return session
}

export function getSession(id: string): Session | undefined {
  return sessions.get(id)
}

export function attachSocket(
  sessionId: string,
  socket: ServerWebSocket<SocketData>
): void {
  const s = sessions.get(sessionId)
  if (!s) return
  s.socket = socket
}

export function detachSocket(sessionId: string): void {
  const s = sessions.get(sessionId)
  if (!s) return
  s.socket = undefined
}

/**
 * Drop a session from the in-memory map and delete its workspace on disk.
 * Called by the cleanup sweep after the grace period expires.
 */
export function removeSession(sessionId: string, workspaceRoot: string): void {
  const s = sessions.get(sessionId)
  if (!s) return
  sessions.delete(sessionId)
  try {
    destroyWorkspace(workspaceRoot, sessionId)
  } catch {
    /* best effort */
  }
}

/** Used by the dev "/_debug" endpoint and tests. */
export function listSessions(): Session[] {
  return [...sessions.values()]
}
