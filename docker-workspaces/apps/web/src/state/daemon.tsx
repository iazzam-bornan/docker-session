/* eslint-disable react-refresh/only-export-components */
import * as React from "react"

import type {
  ClientMessage,
  ContainerFileEntry,
  ContainerInfo,
  ContainerStatsSample,
  DirEntry,
  HostInfo,
  ImageInfo,
  ServerMessage,
} from "@workspace/protocol"

import { backendWsOrigin } from "@/lib/backend"

// ─────────────────────────────────────────────────────────────────────────
// daemon
//
// thin react wrapper around a single websocket to apps/server. owns:
//   • the socket lifecycle (connect, retry, close)
//   • the user's session id (assigned by the server after `hello`)
//   • a request/reply correlator keyed on msgId so multiple commands can be
//     in flight simultaneously
//
// the public surface is intentionally tiny:
//   const { connection, run } = useDaemon()
//   const result = await run("docker images", chunk => terminal.append(chunk))
// ─────────────────────────────────────────────────────────────────────────

export type ConnectionState = "idle" | "connecting" | "open" | "closed"

export type StreamChunk = {
  stream: "stdout" | "stderr"
  text: string
}

export type RunResult =
  | { status: "ok"; exitCode: number; cwdUpdate?: string }
  | { status: "rejected"; reason: string; hint?: string }
  | { status: "error"; message: string }

type PendingRun = {
  resolve: (r: RunResult) => void
  onChunk: (c: StreamChunk) => void
}

type PendingPortLookup = {
  resolve: (hostPort: number | null) => void
}

type PendingInventory = {
  resolve: (r: InventoryResult) => void
}

export type InventoryResult =
  | { ok: true; containers: ContainerInfo[]; images: ImageInfo[] }
  | { ok: false; error: string }

// Per-container ops share one pending map. Each entry knows which reply
// kind it's waiting for so the message router can dispatch correctly.
type PendingContainerOp =
  | { kind: "stats"; resolve: (r: StatsResult) => void }
  | { kind: "ls"; resolve: (r: ContainerLsResult) => void }
  | { kind: "exec"; resolve: (r: ContainerExecResult) => void }

export type StatsResult =
  | { ok: true; sample: ContainerStatsSample | null }
  | { ok: false; error: string }

export type ContainerLsResult =
  | { ok: true; path: string; entries: ContainerFileEntry[] }
  | { ok: false; error: string }

export type ContainerExecResult =
  | { ok: true; stdout: string; stderr: string; exitCode: number }
  | { ok: false; error: string }

// File-system request/reply correlator. The same map handles list_dir,
// read_file, and write_file replies — each entry knows what shape it
// expects, so we just call its resolve with the parsed message.
type PendingFileRequest =
  | { kind: "list_dir"; resolve: (r: ListDirResult) => void }
  | { kind: "read_file"; resolve: (r: ReadFileResult) => void }
  | { kind: "write_file"; resolve: (r: WriteFileResult) => void }

export type ListDirResult =
  | { ok: true; entries: DirEntry[] }
  | { ok: false; error: string }

export type ReadFileResult =
  | { ok: true; content: string; language: string }
  | { ok: false; error: string }

export type WriteFileResult = { ok: true } | { ok: false; error: string }

export type DaemonContextValue = {
  connection: ConnectionState
  sessionId: string | null
  /** Absolute home directory on the server. Null until hello resolves. */
  home: string | null
  /** Static host info from the hello reply. Null until hello resolves. */
  host: HostInfo | null
  run: (
    command: string,
    cwd: string,
    onChunk: (c: StreamChunk) => void,
    /**
     * Optional AbortSignal — when aborted, the daemon sends a `cancel`
     * message for the in-flight command. The promise still resolves
     * normally with whatever exit code the kill produced.
     */
    signal?: AbortSignal
  ) => Promise<RunResult>
  /**
   * Resolve `guestPort` (the port the user typed in `docker run -p X:X`) to
   * the actual host port the container is bound to. Returns null if the
   * session hasn't reserved that port. Used by the browser to make
   * localhost URLs Just Work without exposing the per-session port pool.
   */
  lookupPort: (guestPort: number) => Promise<number | null>
  /** Cancel an in-flight `run` by its msgId. */
  cancel: (targetId: number) => void
  /** List entries in the user's workspace at `path` (relative to root). */
  listDir: (path: string) => Promise<ListDirResult>
  /** Read the contents of a file in the user's workspace. */
  readFile: (path: string) => Promise<ReadFileResult>
  /** Overwrite a file in the user's workspace. */
  writeFile: (path: string, content: string) => Promise<WriteFileResult>
  /** Snapshot of the user's containers + images. */
  listInventory: () => Promise<InventoryResult>
  /** Live single-container stats snapshot (for the per-container view). */
  getContainerStats: (rawName: string) => Promise<StatsResult>
  /** List files inside a running container at the given absolute path. */
  containerLs: (rawName: string, path: string) => Promise<ContainerLsResult>
  /** Run a one-shot shell command inside a running container. */
  containerExec: (
    rawName: string,
    command: string
  ) => Promise<ContainerExecResult>
}

const DaemonContext = React.createContext<DaemonContextValue | undefined>(
  undefined
)

function defaultUrl(): string {
  return `${backendWsOrigin()}/ws`
}

type DaemonProviderProps = {
  username: string
  url?: string
  children: React.ReactNode
}

export function DaemonProvider({
  username,
  url,
  children,
}: DaemonProviderProps) {
  const [connection, setConnection] = React.useState<ConnectionState>("idle")
  const [sessionId, setSessionId] = React.useState<string | null>(null)
  const [home, setHome] = React.useState<string | null>(null)
  const [host, setHost] = React.useState<HostInfo | null>(null)

  const wsRef = React.useRef<WebSocket | null>(null)
  const nextIdRef = React.useRef(1)
  const pendingRef = React.useRef(new Map<number, PendingRun>())
  const pendingPortRef = React.useRef(new Map<number, PendingPortLookup>())
  const pendingFileRef = React.useRef(new Map<number, PendingFileRequest>())
  const pendingInventoryRef = React.useRef(new Map<number, PendingInventory>())
  const pendingContainerOpRef = React.useRef(
    new Map<number, PendingContainerOp>()
  )
  const helloResolveRef = React.useRef<((id: string) => void) | null>(null)
  const helloPromiseRef = React.useRef<Promise<string> | null>(null)
  const retryTimerRef = React.useRef<number | null>(null)
  const retryAttemptsRef = React.useRef(0)
  // teardown timer used to survive React Strict Mode's mount → cleanup →
  // mount cycle without thrashing the socket
  const teardownTimerRef = React.useRef<number | null>(null)
  // when true, the close handler should not auto-reconnect
  const disposedRef = React.useRef(false)

  // ─── connect ───────────────────────────────────────────────────────────
  React.useEffect(() => {
    const target = url ?? defaultUrl()

    // If a previous teardown is queued (Strict Mode double-mount), cancel
    // it and reuse the existing socket. The close handlers, message router,
    // and refs are all still wired up correctly.
    if (teardownTimerRef.current !== null) {
      window.clearTimeout(teardownTimerRef.current)
      teardownTimerRef.current = null
      return scheduleTeardown
    }

    // Fresh effect run — actually open a socket.
    disposedRef.current = false

    const connect = () => {
      if (disposedRef.current) return
      setConnection("connecting")
      const ws = new WebSocket(target)
      wsRef.current = ws

      helloPromiseRef.current = new Promise<string>((resolve) => {
        helloResolveRef.current = resolve
      })

      ws.addEventListener("open", () => {
        retryAttemptsRef.current = 0
        setConnection("open")
        ws.send(
          JSON.stringify({
            kind: "hello",
            username,
            msgId: nextIdRef.current++,
          } satisfies ClientMessage)
        )
      })

      ws.addEventListener("message", (e) => {
        let msg: ServerMessage
        try {
          msg = JSON.parse(String(e.data)) as ServerMessage
        } catch {
          return
        }
        handleMessage(msg)
      })

      ws.addEventListener("close", () => {
        setConnection("closed")
        for (const [, p] of pendingRef.current) {
          p.resolve({ status: "error", message: "connection closed" })
        }
        pendingRef.current.clear()
        for (const [, p] of pendingPortRef.current) p.resolve(null)
        pendingPortRef.current.clear()
        for (const [, f] of pendingFileRef.current) {
          f.resolve({ ok: false, error: "connection closed" } as ListDirResult &
            ReadFileResult &
            WriteFileResult)
        }
        pendingFileRef.current.clear()
        for (const [, i] of pendingInventoryRef.current) {
          i.resolve({ ok: false, error: "connection closed" })
        }
        pendingInventoryRef.current.clear()
        for (const [, op] of pendingContainerOpRef.current) {
          op.resolve({ ok: false, error: "connection closed" } as StatsResult &
            ContainerLsResult &
            ContainerExecResult)
        }
        pendingContainerOpRef.current.clear()
        if (disposedRef.current) return
        retryAttemptsRef.current++
        const delay = Math.min(8000, 500 * 2 ** (retryAttemptsRef.current - 1))
        retryTimerRef.current = window.setTimeout(connect, delay)
      })

      ws.addEventListener("error", () => {
        // close handler will run next; nothing to do here
      })
    }

    function scheduleTeardown() {
      teardownTimerRef.current = window.setTimeout(() => {
        teardownTimerRef.current = null
        disposedRef.current = true
        if (retryTimerRef.current) {
          window.clearTimeout(retryTimerRef.current)
          retryTimerRef.current = null
        }
        wsRef.current?.close()
        wsRef.current = null
      }, 50)
    }

    connect()
    return scheduleTeardown
    // username intentionally excluded — see comment below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url])

  // ─── message router ────────────────────────────────────────────────────
  const handleMessage = (msg: ServerMessage) => {
    switch (msg.kind) {
      case "hello": {
        setSessionId(msg.sessionId)
        setHome(msg.home)
        setHost(msg.host)
        helloResolveRef.current?.(msg.sessionId)
        helloResolveRef.current = null
        return
      }
      case "stream": {
        const p = pendingRef.current.get(msg.msgId)
        if (!p) return
        p.onChunk({ stream: msg.stream, text: msg.text })
        return
      }
      case "done": {
        const p = pendingRef.current.get(msg.msgId)
        if (!p) return
        pendingRef.current.delete(msg.msgId)
        p.resolve({
          status: "ok",
          exitCode: msg.exitCode,
          ...(msg.cwdUpdate !== undefined ? { cwdUpdate: msg.cwdUpdate } : {}),
        })
        return
      }
      case "reject": {
        if (msg.msgId === undefined) return
        const p = pendingRef.current.get(msg.msgId)
        if (!p) return
        pendingRef.current.delete(msg.msgId)
        p.resolve({ status: "rejected", reason: msg.reason, hint: msg.hint })
        return
      }
      case "error": {
        if (msg.msgId === undefined) return
        // could be a run, port lookup, or file request — try each
        const r = pendingRef.current.get(msg.msgId)
        if (r) {
          pendingRef.current.delete(msg.msgId)
          r.resolve({ status: "error", message: msg.message })
          return
        }
        const p = pendingPortRef.current.get(msg.msgId)
        if (p) {
          pendingPortRef.current.delete(msg.msgId)
          p.resolve(null)
          return
        }
        const f = pendingFileRef.current.get(msg.msgId)
        if (f) {
          pendingFileRef.current.delete(msg.msgId)
          // every file variant has the same `{ ok: false; error }` shape
          f.resolve({ ok: false, error: msg.message } as ListDirResult &
            ReadFileResult &
            WriteFileResult)
          return
        }
        const i = pendingInventoryRef.current.get(msg.msgId)
        if (i) {
          pendingInventoryRef.current.delete(msg.msgId)
          i.resolve({ ok: false, error: msg.message })
          return
        }
        const op = pendingContainerOpRef.current.get(msg.msgId)
        if (op) {
          pendingContainerOpRef.current.delete(msg.msgId)
          op.resolve({ ok: false, error: msg.message } as StatsResult &
            ContainerLsResult &
            ContainerExecResult)
        }
        return
      }
      case "port_lookup": {
        const p = pendingPortRef.current.get(msg.msgId)
        if (!p) return
        pendingPortRef.current.delete(msg.msgId)
        p.resolve(msg.hostPort)
        return
      }
      case "dir_listing": {
        const f = pendingFileRef.current.get(msg.msgId)
        if (!f || f.kind !== "list_dir") return
        pendingFileRef.current.delete(msg.msgId)
        f.resolve({ ok: true, entries: msg.entries })
        return
      }
      case "file_contents": {
        const f = pendingFileRef.current.get(msg.msgId)
        if (!f || f.kind !== "read_file") return
        pendingFileRef.current.delete(msg.msgId)
        f.resolve({
          ok: true,
          content: msg.content,
          language: msg.language,
        })
        return
      }
      case "write_ok": {
        const f = pendingFileRef.current.get(msg.msgId)
        if (!f || f.kind !== "write_file") return
        pendingFileRef.current.delete(msg.msgId)
        f.resolve({ ok: true })
        return
      }
      case "container_list": {
        const i = pendingInventoryRef.current.get(msg.msgId)
        if (!i) return
        pendingInventoryRef.current.delete(msg.msgId)
        i.resolve({
          ok: true,
          containers: msg.containers,
          images: msg.images,
        })
        return
      }
      case "container_stats_reply": {
        const op = pendingContainerOpRef.current.get(msg.msgId)
        if (!op || op.kind !== "stats") return
        pendingContainerOpRef.current.delete(msg.msgId)
        op.resolve({ ok: true, sample: msg.sample })
        return
      }
      case "container_ls_reply": {
        const op = pendingContainerOpRef.current.get(msg.msgId)
        if (!op || op.kind !== "ls") return
        pendingContainerOpRef.current.delete(msg.msgId)
        op.resolve({ ok: true, path: msg.path, entries: msg.entries })
        return
      }
      case "container_exec_reply": {
        const op = pendingContainerOpRef.current.get(msg.msgId)
        if (!op || op.kind !== "exec") return
        pendingContainerOpRef.current.delete(msg.msgId)
        op.resolve({
          ok: true,
          stdout: msg.stdout,
          stderr: msg.stderr,
          exitCode: msg.exitCode,
        })
        return
      }
    }
  }

  // ─── public api ────────────────────────────────────────────────────────
  const run = React.useCallback(
    async (
      command: string,
      cwd: string,
      onChunk: (c: StreamChunk) => void,
      signal?: AbortSignal
    ): Promise<RunResult> => {
      const ws = wsRef.current
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        return { status: "error", message: "not connected" }
      }
      // make sure hello has settled before sending commands
      if (helloPromiseRef.current) {
        try {
          await helloPromiseRef.current
        } catch {
          /* ignore */
        }
      }
      return new Promise<RunResult>((resolve) => {
        const msgId = nextIdRef.current++
        pendingRef.current.set(msgId, { resolve, onChunk })

        // wire the abort signal: when the caller aborts, send a cancel
        // message that targets *this* run's msgId. the server kills the
        // process and a normal `done` reply will close the loop.
        if (signal) {
          const sendCancel = () => {
            const sock = wsRef.current
            if (!sock || sock.readyState !== WebSocket.OPEN) return
            sock.send(
              JSON.stringify({
                kind: "cancel",
                msgId: nextIdRef.current++,
                targetId: msgId,
              } satisfies ClientMessage)
            )
          }
          if (signal.aborted) sendCancel()
          else signal.addEventListener("abort", sendCancel, { once: true })
        }

        ws.send(
          JSON.stringify({
            kind: "run",
            msgId,
            command,
            cwd,
          } satisfies ClientMessage)
        )
      })
    },
    []
  )

  const lookupPort = React.useCallback(
    async (guestPort: number): Promise<number | null> => {
      const ws = wsRef.current
      if (!ws || ws.readyState !== WebSocket.OPEN) return null
      if (helloPromiseRef.current) {
        try {
          await helloPromiseRef.current
        } catch {
          /* ignore */
        }
      }
      return new Promise<number | null>((resolve) => {
        const msgId = nextIdRef.current++
        pendingPortRef.current.set(msgId, { resolve })
        ws.send(
          JSON.stringify({
            kind: "lookup_port",
            msgId,
            guestPort,
          } satisfies ClientMessage)
        )
      })
    },
    []
  )

  const cancel = React.useCallback((targetId: number) => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    ws.send(
      JSON.stringify({
        kind: "cancel",
        msgId: nextIdRef.current++,
        targetId,
      } satisfies ClientMessage)
    )
  }, [])

  // ─── file operations ────────────────────────────────────────────────
  // All three follow the same pattern: assign a msgId, register a pending
  // entry, send the request, return a promise that the message router
  // will resolve when the matching reply arrives.

  const sendFileRequest = React.useCallback(
    async <T,>(msg: ClientMessage, pending: PendingFileRequest): Promise<T> => {
      const ws = wsRef.current
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        return { ok: false, error: "not connected" } as T
      }
      if (helloPromiseRef.current) {
        try {
          await helloPromiseRef.current
        } catch {
          /* ignore */
        }
      }
      return new Promise<T>((resolve) => {
        const id = (msg as { msgId: number }).msgId
        pendingFileRef.current.set(id, {
          ...pending,
          resolve: resolve as PendingFileRequest["resolve"],
        } as PendingFileRequest)
        ws.send(JSON.stringify(msg))
      })
    },
    []
  )

  const listDir = React.useCallback(
    (path: string): Promise<ListDirResult> => {
      const msgId = nextIdRef.current++
      return sendFileRequest<ListDirResult>(
        { kind: "list_dir", msgId, path },
        { kind: "list_dir", resolve: () => {} }
      )
    },
    [sendFileRequest]
  )

  const readFile = React.useCallback(
    (path: string): Promise<ReadFileResult> => {
      const msgId = nextIdRef.current++
      return sendFileRequest<ReadFileResult>(
        { kind: "read_file", msgId, path },
        { kind: "read_file", resolve: () => {} }
      )
    },
    [sendFileRequest]
  )

  const writeFile = React.useCallback(
    (path: string, content: string): Promise<WriteFileResult> => {
      const msgId = nextIdRef.current++
      return sendFileRequest<WriteFileResult>(
        { kind: "write_file", msgId, path, content },
        { kind: "write_file", resolve: () => {} }
      )
    },
    [sendFileRequest]
  )

  const listInventory =
    React.useCallback(async (): Promise<InventoryResult> => {
      const ws = wsRef.current
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        return { ok: false, error: "not connected" }
      }
      if (helloPromiseRef.current) {
        try {
          await helloPromiseRef.current
        } catch {
          /* ignore */
        }
      }
      return new Promise<InventoryResult>((resolve) => {
        const msgId = nextIdRef.current++
        pendingInventoryRef.current.set(msgId, { resolve })
        ws.send(
          JSON.stringify({
            kind: "list_containers",
            msgId,
          } satisfies ClientMessage)
        )
      })
    }, [])

  // ─── per-container ops ────────────────────────────────────────────
  const sendContainerOp = React.useCallback(
    async <T,>(msg: ClientMessage, pending: PendingContainerOp): Promise<T> => {
      const ws = wsRef.current
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        return { ok: false, error: "not connected" } as T
      }
      if (helloPromiseRef.current) {
        try {
          await helloPromiseRef.current
        } catch {
          /* ignore */
        }
      }
      return new Promise<T>((resolve) => {
        const id = (msg as { msgId: number }).msgId
        pendingContainerOpRef.current.set(id, {
          ...pending,
          resolve: resolve as PendingContainerOp["resolve"],
        } as PendingContainerOp)
        ws.send(JSON.stringify(msg))
      })
    },
    []
  )

  const getContainerStats = React.useCallback(
    (name: string): Promise<StatsResult> => {
      const msgId = nextIdRef.current++
      return sendContainerOp<StatsResult>(
        { kind: "container_stats", msgId, name },
        { kind: "stats", resolve: () => {} }
      )
    },
    [sendContainerOp]
  )

  const containerLs = React.useCallback(
    (name: string, path: string): Promise<ContainerLsResult> => {
      const msgId = nextIdRef.current++
      return sendContainerOp<ContainerLsResult>(
        { kind: "container_ls", msgId, name, path },
        { kind: "ls", resolve: () => {} }
      )
    },
    [sendContainerOp]
  )

  const containerExec = React.useCallback(
    (name: string, command: string): Promise<ContainerExecResult> => {
      const msgId = nextIdRef.current++
      return sendContainerOp<ContainerExecResult>(
        { kind: "container_exec", msgId, name, command },
        { kind: "exec", resolve: () => {} }
      )
    },
    [sendContainerOp]
  )

  const value = React.useMemo<DaemonContextValue>(
    () => ({
      connection,
      sessionId,
      home,
      host,
      run,
      lookupPort,
      cancel,
      listDir,
      readFile,
      writeFile,
      listInventory,
      getContainerStats,
      containerLs,
      containerExec,
    }),
    [
      connection,
      sessionId,
      home,
      host,
      run,
      lookupPort,
      cancel,
      listDir,
      readFile,
      writeFile,
      listInventory,
      getContainerStats,
      containerLs,
      containerExec,
    ]
  )

  return (
    <DaemonContext.Provider value={value}>{children}</DaemonContext.Provider>
  )
}

export function useDaemon() {
  const ctx = React.useContext(DaemonContext)
  if (!ctx) throw new Error("useDaemon must be used within DaemonProvider")
  return ctx
}
