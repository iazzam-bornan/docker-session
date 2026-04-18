// ─────────────────────────────────────────────────────────────────────────
// per-container operations used by the detail view in containers-app.
//
//   • getContainerStats(name)  → docker stats --no-stream
//   • containerLs(name, path)  → docker exec <name> ls -la <path>
//   • containerExec(name, cmd) → docker exec <name> sh -c <cmd>
//
// every function validates that the target container name starts with the
// current session's id prefix before shelling out. that's the only thing
// stopping a malicious client from poking at other sessions' containers.
// ─────────────────────────────────────────────────────────────────────────

import type {
  ContainerFileEntry,
  ContainerStatsSample,
} from "@workspace/protocol"

import type { Session } from "./session"

const EXEC_TIMEOUT_MS = 10_000

export type OpsError = { error: string }

/** Reject names that don't belong to this session. */
function ownsContainer(session: Session, name: string): boolean {
  return name === session.id || name.startsWith(`${session.id}-`)
}

// ─── stats ───────────────────────────────────────────────────────────────

type DockerStatsRow = {
  CPUPerc?: string
  MemUsage?: string
  MemPerc?: string
  NetIO?: string
  BlockIO?: string
  PIDs?: string
  Name?: string
}

function parsePercent(s: string | undefined): number {
  if (!s) return 0
  const m = s.match(/([\d.]+)/)
  return m ? parseFloat(m[1]) : 0
}

/** Convert docker's "4.1kB", "11.89MiB", "2.5GB" to bytes. */
function parseHumanBytes(raw: string | undefined): number {
  if (!raw) return 0
  const m = raw.trim().match(/^([\d.]+)\s*([kKmMgGtT]?i?)(b|B)?$/)
  if (!m) return 0
  const num = parseFloat(m[1])
  const unit = (m[2] ?? "").toLowerCase()
  const mul =
    unit === "" ? 1
      : unit === "k" ? 1_000
        : unit === "ki" ? 1_024
          : unit === "m" ? 1_000_000
            : unit === "mi" ? 1_048_576
              : unit === "g" ? 1_000_000_000
                : unit === "gi" ? 1_073_741_824
                  : unit === "t" ? 1_000_000_000_000
                    : unit === "ti" ? 1_099_511_627_776
                      : 1
  return Math.round(num * mul)
}

function toMB(bytes: number): number {
  return bytes / 1_048_576
}

function splitPair(raw: string | undefined): [string, string] {
  if (!raw) return ["", ""]
  const parts = raw.split("/").map((p) => p.trim())
  return [parts[0] ?? "", parts[1] ?? ""]
}

export function parseStatsRow(row: DockerStatsRow): ContainerStatsSample {
  const [memUsageRaw, memLimitRaw] = splitPair(row.MemUsage)
  const [netRxRaw, netTxRaw] = splitPair(row.NetIO)
  const [blockReadRaw, blockWriteRaw] = splitPair(row.BlockIO)

  const memUsageBytes = parseHumanBytes(memUsageRaw)
  const memLimitBytes = parseHumanBytes(memLimitRaw)

  return {
    cpuPercent: parsePercent(row.CPUPerc),
    memUsageMB: toMB(memUsageBytes),
    memLimitMB: toMB(memLimitBytes),
    memPercent: parsePercent(row.MemPerc),
    netRxBytes: parseHumanBytes(netRxRaw),
    netTxBytes: parseHumanBytes(netTxRaw),
    blockReadBytes: parseHumanBytes(blockReadRaw),
    blockWriteBytes: parseHumanBytes(blockWriteRaw),
    pids: parseInt(row.PIDs ?? "0", 10) || 0,
  }
}

/**
 * Get a single live stats snapshot for one container. Returns null for
 * containers that aren't running (docker stats refuses to report them).
 */
export async function getContainerStats(
  session: Session,
  name: string
): Promise<ContainerStatsSample | null | OpsError> {
  if (!ownsContainer(session, name)) {
    return { error: "not your container" }
  }
  try {
    const proc = Bun.spawn(
      [
        "docker",
        "stats",
        "--no-stream",
        "--format",
        "{{json .}}",
        name,
      ],
      { stdout: "pipe", stderr: "pipe", stdin: "ignore" }
    )
    const timer = setTimeout(() => {
      try {
        proc.kill()
      } catch {
        /* noop */
      }
    }, EXEC_TIMEOUT_MS)
    const text = await new Response(proc.stdout).text()
    clearTimeout(timer)
    await proc.exited
    const line = text.trim().split("\n")[0]
    if (!line) return null
    const row = JSON.parse(line) as DockerStatsRow
    return parseStatsRow(row)
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Get stats for every running container in one shot. Cheaper than
 * calling getContainerStats N times. Returns a map keyed by container
 * name → sample.
 */
export async function getAllStats(): Promise<Map<string, ContainerStatsSample>> {
  const out = new Map<string, ContainerStatsSample>()
  try {
    const proc = Bun.spawn(
      ["docker", "stats", "--no-stream", "--format", "{{json .}}"],
      { stdout: "pipe", stderr: "pipe", stdin: "ignore" }
    )
    const timer = setTimeout(() => {
      try {
        proc.kill()
      } catch {
        /* noop */
      }
    }, EXEC_TIMEOUT_MS)
    const text = await new Response(proc.stdout).text()
    clearTimeout(timer)
    await proc.exited
    for (const line of text.split("\n")) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        const row = JSON.parse(trimmed) as DockerStatsRow
        if (!row.Name) continue
        out.set(row.Name, parseStatsRow(row))
      } catch {
        /* ignore unparseable */
      }
    }
  } catch {
    /* leave out empty on failure */
  }
  return out
}

// ─── ls ──────────────────────────────────────────────────────────────────

/**
 * Parse output of `ls -la`. We can't use `--time-style` because busybox ls
 * (the one shipped in alpine images) doesn't support it. So we parse the
 * default formats:
 *
 *   recent file:  -rw-r--r--  1 root root  220 Apr  8 12:00 .bashrc
 *   old file:     -rw-r--r--  1 root root  220 Apr  8  2024 .bashrc
 *   ISO (--full-time): -rw-r--r--  1 root root  220 2025-04-08 12:00:00 .bashrc
 *   GNU full:     -rw-r--r--  1 root root  220 2025-04-08 12:00:00.000 +0000 .bashrc
 *
 * Strategy: regex-match the prefix (mode .. size) with a generic
 * separator, then sniff the trailing chunk for whichever date format
 * applies and split off the name (which may contain " -> target" for
 * symlinks).
 */
function parseLsOutput(text: string): ContainerFileEntry[] {
  const out: ContainerFileEntry[] = []
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trimEnd()
    if (!line) continue
    if (line.startsWith("total ")) continue

    // mode + nlink + owner + group + size + (rest)
    // mode is 10 chars + optional ACL/xattr indicator
    const prefix = line.match(
      /^([dlcbps-][rwxSsTt-]{9}[.@+]?)\s+\d+\s+\S+\s+\S+\s+(\d+)\s+(.+)$/
    )
    if (!prefix) continue

    const mode = prefix[1]
    const size = parseInt(prefix[2], 10) || 0
    let rest = prefix[3]

    // Extract the date prefix from `rest`. Try formats in order of
    // specificity so the longer ones match before the shorter ones.
    let modified = ""
    // 1. ISO with timezone: "YYYY-MM-DD HH:MM:SS.fff +ZZZZ"
    let m = rest.match(
      /^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d+\s+[+-]\d{4})\s+(.+)$/
    )
    if (m) {
      modified = m[1]
      rest = m[2]
    }
    // 2. ISO seconds: "YYYY-MM-DD HH:MM:SS"
    if (!modified) {
      m = rest.match(/^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\s+(.+)$/)
      if (m) {
        modified = m[1]
        rest = m[2]
      }
    }
    // 3. ISO short: "YYYY-MM-DD HH:MM"
    if (!modified) {
      m = rest.match(/^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})\s+(.+)$/)
      if (m) {
        modified = m[1]
        rest = m[2]
      }
    }
    // 4. busybox default: "Mon DD HH:MM" or "Mon DD YYYY" (with possible
    //    extra space between day and year for alignment)
    if (!modified) {
      m = rest.match(
        /^([A-Z][a-z]{2}\s+\d{1,2}\s+(?:\d{1,2}:\d{2}|\d{4}))\s+(.+)$/
      )
      if (m) {
        modified = m[1].replace(/\s+/g, " ")
        rest = m[2]
      }
    }
    // if we still couldn't find a date, give up on this line — it's
    // probably an `ls` warning or a malformed row
    if (!modified) continue

    let name = rest
    let target: string | null = null
    const arrow = name.indexOf(" -> ")
    if (arrow >= 0) {
      target = name.slice(arrow + 4)
      name = name.slice(0, arrow)
    }
    if (name === "." || name === "..") continue

    const first = mode[0]
    const kind: ContainerFileEntry["kind"] =
      first === "d"
        ? "dir"
        : first === "l"
          ? "link"
          : first === "-"
            ? "file"
            : "other"

    out.push({ name, kind, size, mode, modified, target })
  }
  // sort: dirs first, then alpha
  out.sort((a, b) => {
    if (a.kind !== b.kind) {
      if (a.kind === "dir") return -1
      if (b.kind === "dir") return 1
    }
    return a.name.localeCompare(b.name)
  })
  return out
}

/** Resolve a client-supplied path into something docker exec can accept. */
function cleanContainerPath(path: string): string {
  const trimmed = (path || "/").trim()
  if (!trimmed.startsWith("/")) return "/" + trimmed
  return trimmed
}

export async function containerLs(
  session: Session,
  name: string,
  path: string
): Promise<{ entries: ContainerFileEntry[]; path: string } | OpsError> {
  if (!ownsContainer(session, name)) {
    return { error: "not your container" }
  }
  const clean = cleanContainerPath(path)
  try {
    // Plain `ls -la` only — `--time-style` is GNU coreutils only and
    // breaks busybox / alpine. The parser handles both default formats.
    const proc = Bun.spawn(
      ["docker", "exec", name, "ls", "-la", clean],
      { stdout: "pipe", stderr: "pipe", stdin: "ignore" }
    )
    const timer = setTimeout(() => {
      try {
        proc.kill()
      } catch {
        /* noop */
      }
    }, EXEC_TIMEOUT_MS)
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ])
    clearTimeout(timer)
    const exitCode = await proc.exited
    if (exitCode !== 0) {
      return {
        error: stderr.trim() || `ls exited ${exitCode}`,
      }
    }
    return { entries: parseLsOutput(stdout), path: clean }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

// ─── exec ────────────────────────────────────────────────────────────────

export async function containerExec(
  session: Session,
  name: string,
  command: string
): Promise<
  | { stdout: string; stderr: string; exitCode: number }
  | OpsError
> {
  if (!ownsContainer(session, name)) {
    return { error: "not your container" }
  }
  if (!command.trim()) {
    return { stdout: "", stderr: "", exitCode: 0 }
  }
  // very defensive length cap
  if (command.length > 4_096) {
    return { error: "command too long" }
  }
  try {
    const proc = Bun.spawn(
      ["docker", "exec", name, "sh", "-c", command],
      { stdout: "pipe", stderr: "pipe", stdin: "ignore" }
    )
    const timer = setTimeout(() => {
      try {
        proc.kill()
      } catch {
        /* noop */
      }
    }, EXEC_TIMEOUT_MS)
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ])
    clearTimeout(timer)
    const exitCode = await proc.exited
    return { stdout, stderr, exitCode }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}
