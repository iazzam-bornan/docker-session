// Spawns a child process and streams its stdout/stderr line-by-line through
// a callback. Returns a promise that resolves with the exit code.

import type { Subprocess } from "bun"

export type StreamCallback = (stream: "stdout" | "stderr", text: string) => void

export type RunOptions = {
  cmd: string[]
  cwd?: string
  env?: Record<string, string>
  /** kill the process if it runs longer than this many ms */
  timeoutMs?: number
  /**
   * Called once with the spawned process handle so the caller can register
   * it for cancellation. Used by the cancel handler in index.ts.
   */
  onSpawn?: (proc: Subprocess) => void
}

export type RunResult = {
  exitCode: number
  timedOut: boolean
}

export async function runStreaming(
  opts: RunOptions,
  onChunk: StreamCallback
): Promise<RunResult> {
  const proc = Bun.spawn(opts.cmd, {
    cwd: opts.cwd,
    env: opts.env ? { ...process.env, ...opts.env } : process.env,
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
  })

  opts.onSpawn?.(proc)

  let timedOut = false
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  if (opts.timeoutMs) {
    timeoutId = setTimeout(() => {
      timedOut = true
      proc.kill()
    }, opts.timeoutMs)
  }

  // pipe both stdout and stderr concurrently
  await Promise.all([
    pipeStream(proc.stdout, "stdout", onChunk),
    pipeStream(proc.stderr, "stderr", onChunk),
  ])

  const exitCode = await proc.exited
  if (timeoutId) clearTimeout(timeoutId)

  return { exitCode, timedOut }
}

async function pipeStream(
  source: ReadableStream<Uint8Array>,
  label: "stdout" | "stderr",
  onChunk: StreamCallback
): Promise<void> {
  const decoder = new TextDecoder()
  const reader = source.getReader()
  // We forward the raw decoded text (including its existing newlines) so that
  // docker's progress lines render naturally on the frontend. The frontend is
  // responsible for splitting on \n if it wants discrete rows.
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    if (!value || value.length === 0) continue
    const text = decoder.decode(value, { stream: true })
    if (text) onChunk(label, text)
  }
  // flush any trailing bytes the decoder is still holding
  const tail = decoder.decode()
  if (tail) onChunk(label, tail)
}
