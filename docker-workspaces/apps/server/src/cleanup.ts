// ─────────────────────────────────────────────────────────────────────────
// session cleanup
//
// when a websocket closes we don't immediately wipe the session — wifi
// blips are common, so we want a brief grace period during which the user
// can reconnect and resume. if no new socket attaches within the grace
// window, we sweep:
//
//   • all containers labelled session=<id>
//   • all images labelled session=<id>
//   • the user's workspace directory on disk
//   • the per-session port reservation slice
//
// the user keeps the same session id (derived from username), so a quick
// disconnect/reconnect just hits the cancel path and nothing happens.
// ─────────────────────────────────────────────────────────────────────────

import type { Session } from "./session"
import { releaseAllPorts } from "./workspace"

const GRACE_MS = 90_000 // 90 seconds — survives network blips, kills idle tabs

const pendingCleanups = new Map<string, ReturnType<typeof setTimeout>>()

function log(...args: unknown[]): void {
  console.log("[cleanup]", ...args)
}

async function runDocker(args: string[], timeoutMs = 30_000): Promise<string> {
  const proc = Bun.spawn(["docker", ...args], {
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
  })
  const timer = setTimeout(() => {
    try {
      proc.kill()
    } catch {
      /* noop */
    }
  }, timeoutMs)
  const text = await new Response(proc.stdout).text()
  clearTimeout(timer)
  await proc.exited
  return text
}

/** Force-remove every container + image labelled with this session. */
async function sweepDockerArtifacts(sessionId: string): Promise<void> {
  const label = `label=session=${sessionId}`
  try {
    // containers (running or not)
    const containerIds = (
      await runDocker(["ps", "-aq", "--filter", label])
    )
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
    if (containerIds.length > 0) {
      await runDocker(["rm", "-f", ...containerIds])
      log(`session ${sessionId}: removed ${containerIds.length} container(s)`)
    }
    // images
    const imageIds = (await runDocker(["images", "-q", "--filter", label]))
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
    if (imageIds.length > 0) {
      await runDocker(["rmi", "-f", ...imageIds])
      log(`session ${sessionId}: removed ${imageIds.length} image(s)`)
    }
  } catch (err) {
    log(`session ${sessionId}: sweep failed`, err)
  }
}

/**
 * Schedule a cleanup for a session whose socket just disconnected. If the
 * user reconnects within `GRACE_MS`, call `cancelCleanup(sessionId)` to
 * abort.
 */
export function scheduleCleanup(
  session: Session,
  onWipe: () => void
): void {
  // cancel any existing pending cleanup so we always get the latest grace
  const existing = pendingCleanups.get(session.id)
  if (existing) clearTimeout(existing)

  const timer = setTimeout(async () => {
    pendingCleanups.delete(session.id)
    log(`session ${session.id}: grace period expired, sweeping`)
    await sweepDockerArtifacts(session.id)
    releaseAllPorts(session.id)
    onWipe()
  }, GRACE_MS)
  pendingCleanups.set(session.id, timer)
  log(
    `session ${session.id}: cleanup scheduled in ${Math.round(GRACE_MS / 1000)}s`
  )
}

export function cancelCleanup(sessionId: string): void {
  const existing = pendingCleanups.get(sessionId)
  if (existing) {
    clearTimeout(existing)
    pendingCleanups.delete(sessionId)
    log(`session ${sessionId}: cleanup cancelled (reconnected)`)
  }
}

/**
 * Sweep everything for a session right now. Used by tests and shutdown.
 */
export async function sweepNow(sessionId: string): Promise<void> {
  cancelCleanup(sessionId)
  await sweepDockerArtifacts(sessionId)
  releaseAllPorts(sessionId)
}
