// ─────────────────────────────────────────────────────────────────────────
// docker inventory snapshots
//
// the containers app polls this every couple of seconds to render real
// state. we shell out to `docker ps` and `docker images` filtered by the
// session label and parse the line-delimited json output (`--format json`)
// into typed objects.
//
// kept off the user-typeable command path on purpose: the user can run
// `docker ps` themselves in the terminal (which prints the table format),
// but the inventory snapshot is a parallel internal channel so we never
// have to parse table columns client-side.
// ─────────────────────────────────────────────────────────────────────────

import type { ContainerInfo, ImageInfo } from "@workspace/protocol"

import { getAllStats } from "./container-ops"
import type { Session } from "./session"

const PS_TIMEOUT_MS = 4_000
const IMAGES_TIMEOUT_MS = 4_000

type DockerPsRow = {
  Names?: string
  Image?: string
  Status?: string
  State?: string
  Ports?: string
  CreatedAt?: string
  RunningFor?: string
}

type DockerImagesRow = {
  Repository?: string
  Tag?: string
  ID?: string
  Size?: string
  CreatedSince?: string
}

async function runDockerJson(args: string[], timeoutMs: number): Promise<unknown[]> {
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
  if (!text.trim()) return []

  // `docker ... --format json` emits one JSON object per line.
  const out: unknown[] = []
  for (const line of text.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      out.push(JSON.parse(trimmed))
    } catch {
      // ignore unparseable lines (banner messages etc)
    }
  }
  return out
}

function stripSessionPrefix(value: string, sessionId: string): string {
  const prefix = `${sessionId}-`
  return value.startsWith(prefix) ? value.slice(prefix.length) : value
}

function inferState(state: string | undefined, status: string | undefined): ContainerInfo["state"] {
  const v = (state ?? status ?? "").toLowerCase()
  if (v.includes("running") || v.includes("up")) return "running"
  if (v.includes("exited")) return "exited"
  if (v.includes("created")) return "created"
  if (v.includes("paused")) return "paused"
  if (v.includes("restarting")) return "restarting"
  if (v.includes("dead")) return "dead"
  return "unknown"
}

export async function listInventory(
  session: Session
): Promise<{ containers: ContainerInfo[]; images: ImageInfo[] }> {
  const label = `label=session=${session.id}`

  // parallelize ps, images, and stats. stats are looked up per-name after
  // ps returns so stopped containers just get null samples.
  const [psRows, imageRows, stats] = await Promise.all([
    runDockerJson(
      ["ps", "-a", "--filter", label, "--format", "{{json .}}"],
      PS_TIMEOUT_MS
    ).catch(() => [] as unknown[]),
    runDockerJson(
      ["images", "--filter", label, "--format", "{{json .}}"],
      IMAGES_TIMEOUT_MS
    ).catch(() => [] as unknown[]),
    getAllStats().catch(() => new Map()),
  ])

  const containers: ContainerInfo[] = (psRows as DockerPsRow[]).map((r) => {
    const rawName = r.Names ?? ""
    return {
      name: stripSessionPrefix(rawName, session.id),
      rawName,
      image: stripSessionPrefix(r.Image ?? "", session.id),
      status: r.Status ?? "",
      state: inferState(r.State, r.Status),
      ports: r.Ports ?? "",
      createdAt: r.RunningFor ?? r.CreatedAt ?? "",
      stats: stats.get(rawName) ?? null,
    }
  })

  const images: ImageInfo[] = (imageRows as DockerImagesRow[]).map((r) => {
    const rawRepository = r.Repository ?? ""
    return {
      repository: stripSessionPrefix(rawRepository, session.id),
      rawRepository,
      tag: r.Tag ?? "",
      id: r.ID ?? "",
      size: r.Size ?? "",
      createdAt: r.CreatedSince ?? "",
    }
  })

  return { containers, images }
}
