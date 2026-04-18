// ─────────────────────────────────────────────────────────────────────────
// dockerlab websocket protocol
// shared by apps/server (the bun backend) and apps/web (the react frontend).
// every message is a JSON-encoded discriminated union with a `kind` field.
// ─────────────────────────────────────────────────────────────────────────

// ─── client → server ─────────────────────────────────────────────────────

/** Sent immediately after the websocket opens. */
export type ClientHello = {
  kind: "hello"
  /** username chosen at the login screen */
  username: string
  /** monotonically-increasing message id used to correlate replies */
  msgId: number
}

/**
 * Run a single command. The backend tries native shell-like handlers first
 * (cd, ls, cat, mkdir…), then falls through to the docker template registry,
 * then rejects. Output is streamed back as `stream` messages followed by a
 * single `done` message.
 */
export type ClientRun = {
  kind: "run"
  msgId: number
  /** raw command line as the user typed it (e.g. "docker images") */
  command: string
  /**
   * The terminal's current working directory, **relative to the session's
   * home directory** (empty string means home itself, "projects/greeter-api"
   * means we're inside the project). Used by `cd` to resolve relative paths
   * and by docker templates that need a build context.
   */
  cwd: string
}

/**
 * Ask the server which host port backs `guestPort` for the current session.
 * Used by the in-app browser to translate `localhost:3000` (what the user
 * typed in the terminal) to the real host port the container is bound to.
 */
export type ClientLookupPort = {
  kind: "lookup_port"
  msgId: number
  guestPort: number
}

/**
 * Cancel an in-flight `run`. The server kills the spawned process and
 * sends back a normal `done` reply with whatever exit code the kill
 * produced. Used by the terminal's cancel button for long commands like
 * `docker logs -f`.
 */
export type ClientCancel = {
  kind: "cancel"
  msgId: number
  /** the msgId of the `run` to cancel */
  targetId: number
}

/** List the entries in a directory inside the user's workspace. */
export type ClientListDir = {
  kind: "list_dir"
  msgId: number
  /** path relative to workspace root (use "" or "." for the root) */
  path: string
}

/** Read a file inside the user's workspace. */
export type ClientReadFile = {
  kind: "read_file"
  msgId: number
  path: string
}

/** Overwrite a file inside the user's workspace. */
export type ClientWriteFile = {
  kind: "write_file"
  msgId: number
  path: string
  content: string
}

/**
 * Ask for a typed snapshot of the user's containers + images. The server
 * runs `docker ps` / `docker images` filtered by session label and returns
 * the parsed result. Used by the containers app to poll real state.
 */
export type ClientListContainers = {
  kind: "list_containers"
  msgId: number
}

/**
 * Ask for a live `docker stats` snapshot for a single container. Returns
 * a single ContainerStatsSample in the `container_stats` reply. Used by
 * the per-container Stats tab, which polls this every ~2 seconds.
 */
export type ClientContainerStats = {
  kind: "container_stats"
  msgId: number
  /** raw container name including session prefix */
  name: string
}

/**
 * List files inside a running container at the given path. Implemented
 * server-side via `docker exec <name> ls -la`. Used by the Files tab.
 */
export type ClientContainerLs = {
  kind: "container_ls"
  msgId: number
  name: string
  path: string
}

/**
 * Run a one-shot shell command inside a running container. The server
 * executes `docker exec <name> sh -c '<command>'` and returns the full
 * stdout/stderr. Used by the Exec tab.
 */
export type ClientContainerExec = {
  kind: "container_exec"
  msgId: number
  name: string
  command: string
}

export type ClientMessage =
  | ClientHello
  | ClientRun
  | ClientLookupPort
  | ClientCancel
  | ClientListDir
  | ClientReadFile
  | ClientWriteFile
  | ClientListContainers
  | ClientContainerStats
  | ClientContainerLs
  | ClientContainerExec

// ─── server → client ─────────────────────────────────────────────────────

/** Host machine info advertised in the hello reply. */
export type HostInfo = {
  /** number of logical CPUs on the docker host */
  cpus: number
  /** total host memory in bytes */
  memBytes: number
}

/** Reply to a `hello`. Carries session info the frontend may want to display. */
export type ServerHello = {
  kind: "hello"
  msgId: number
  sessionId: string
  username: string
  /**
   * Absolute path of the user's *home directory* on the server. Everything
   * the user can read or write lives under this path. Inside it you'll find
   * Desktop/, Documents/, Downloads/, projects/greeter-api/, etc.
   */
  home: string
  /** static info about the host the docker daemon is running on */
  host: HostInfo
}

/**
 * One chunk of output for an in-flight command. The frontend appends each
 * chunk to its terminal buffer in order.
 */
export type ServerStream = {
  kind: "stream"
  msgId: number
  stream: "stdout" | "stderr"
  text: string
}

/** Final reply for a command. After this no more `stream`s will arrive. */
export type ServerDone = {
  kind: "done"
  msgId: number
  /** process exit code; 0 means success */
  exitCode: number
  /**
   * If the command was a `cd` (or anything else that mutates cwd), the
   * server's authoritative new cwd, relative to the session home. The
   * client should adopt this value as its terminal cwd. Absent for
   * commands that don't change cwd.
   */
  cwdUpdate?: string
}

/**
 * The command was rejected before execution — usually because it doesn't
 * match any template, or it had an invalid argument.
 */
export type ServerReject = {
  kind: "reject"
  msgId: number
  reason: string
  /** optional friendly hint to surface to the user */
  hint?: string
}

/** Generic out-of-band error (lost daemon, internal failure, etc.). */
export type ServerError = {
  kind: "error"
  msgId?: number
  message: string
}

/** Reply to a `lookup_port`. `hostPort` is null if there is no reservation. */
export type ServerPortLookup = {
  kind: "port_lookup"
  msgId: number
  guestPort: number
  hostPort: number | null
}

export type DirEntry = {
  name: string
  type: "file" | "dir"
}

/** Reply to a `list_dir`. */
export type ServerDirListing = {
  kind: "dir_listing"
  msgId: number
  path: string
  entries: DirEntry[]
}

/** Reply to a `read_file`. */
export type ServerFileContents = {
  kind: "file_contents"
  msgId: number
  path: string
  content: string
  /** lowercase language token used to pick a syntax highlighter */
  language: string
}

/** Reply to a successful `write_file`. */
export type ServerWriteOk = {
  kind: "write_ok"
  msgId: number
  path: string
}

export type ContainerStatsSample = {
  cpuPercent: number
  memUsageMB: number
  memLimitMB: number
  memPercent: number
  netRxBytes: number
  netTxBytes: number
  blockReadBytes: number
  blockWriteBytes: number
  pids: number
}

export type ContainerInfo = {
  /** display name without the session prefix */
  name: string
  /** raw docker name (with the session prefix) */
  rawName: string
  image: string
  status: string
  state: "running" | "exited" | "created" | "paused" | "restarting" | "dead" | "unknown"
  ports: string
  createdAt: string
  /** live docker stats sample (null for stopped containers) */
  stats: ContainerStatsSample | null
}

export type ImageInfo = {
  /** display repository without the session prefix */
  repository: string
  rawRepository: string
  tag: string
  id: string
  size: string
  createdAt: string
}

/** Reply to a `list_containers`. */
export type ServerContainerList = {
  kind: "container_list"
  msgId: number
  containers: ContainerInfo[]
  images: ImageInfo[]
}

/** Reply to a `container_stats`. Null sample means container isn't running. */
export type ServerContainerStatsReply = {
  kind: "container_stats_reply"
  msgId: number
  sample: ContainerStatsSample | null
}

export type ContainerFileEntry = {
  name: string
  kind: "file" | "dir" | "link" | "other"
  /** size in bytes (0 for dirs) */
  size: number
  mode: string
  modified: string
  /** symlink target when kind === "link" */
  target: string | null
}

/** Reply to a `container_ls`. */
export type ServerContainerLs = {
  kind: "container_ls_reply"
  msgId: number
  path: string
  entries: ContainerFileEntry[]
}

/** Reply to a `container_exec`. */
export type ServerContainerExec = {
  kind: "container_exec_reply"
  msgId: number
  stdout: string
  stderr: string
  exitCode: number
}

export type ServerMessage =
  | ServerHello
  | ServerStream
  | ServerDone
  | ServerReject
  | ServerError
  | ServerPortLookup
  | ServerDirListing
  | ServerFileContents
  | ServerWriteOk
  | ServerContainerList
  | ServerContainerStatsReply
  | ServerContainerLs
  | ServerContainerExec
