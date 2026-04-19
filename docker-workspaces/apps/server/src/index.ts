// ─────────────────────────────────────────────────────────────────────────
// dockerlab backend — vertical slice
//
// what this server does today:
//   • accepts websocket connections at /ws
//   • clients send `hello` with their username, server returns a session
//   • clients send `run` with a docker command
//   • server matches against the template registry, executes via docker
//     CLI, and streams stdout/stderr back as `stream` messages
//   • the only template wired up so far is `docker images`
//
// what's next (in roughly this order):
//   • workspace cloning
//   • the rest of the docker template registry
//   • compose templates
//   • file r/w over websocket
//   • cleanup-on-disconnect sweep
// ─────────────────────────────────────────────────────────────────────────

import { mkdirSync } from "node:fs"
import { cpus, totalmem } from "node:os"
import { resolve } from "node:path"

import type { ClientMessage, ServerMessage } from "@workspace/protocol"

import { cancelCleanup, scheduleCleanup } from "./cleanup"
import { containerExec, containerLs, getContainerStats } from "./container-ops"
import { runStreaming } from "./executor"
import { listDirectory, readFileSafe, safePath, writeFileSafe } from "./files"
import { listInventory } from "./inventory"
import { runNative } from "./native-commands"
import { handleReader } from "./reader"
import { handleSearch } from "./search"
import {
  attachSocket,
  detachSocket,
  getOrCreateSession,
  getSession,
  listSessions,
  removeSession,
  type SocketData,
} from "./session"
import { matchTemplate } from "./templates"
import { lookupHostPort } from "./workspace"

// ─── config ──────────────────────────────────────────────────────────────

const PORT = Number(process.env.PORT ?? 4000)
const WORKSPACE_ROOT = resolve(process.env.WORKSPACE_ROOT ?? "./workspaces")

mkdirSync(WORKSPACE_ROOT, { recursive: true })

// Static host info surfaced to every client via the hello reply. Used by the
// containers app to compute "X% / 1600%" style aggregate headers. Captured
// once at boot since cpus/totalmem don't change at runtime.
const HOST_INFO = {
  cpus: cpus().length,
  memBytes: totalmem(),
}

// ─── tiny helpers ────────────────────────────────────────────────────────

function send(ws: { send: (s: string) => void }, msg: ServerMessage): void {
  ws.send(JSON.stringify(msg))
}

function log(...args: unknown[]): void {
  // tagged so multi-process output stays readable
  console.log("[server]", ...args)
}

// Active spawned processes, keyed on the run's msgId. Populated by the run
// handler before the process exits, removed after. The cancel handler
// looks up entries here to kill long-running commands.
import type { Subprocess } from "bun"
const activeProcs = new Map<number, Subprocess>()

// ─── message handlers ────────────────────────────────────────────────────

async function handleRun(
  ws: { send: (s: string) => void },
  sessionId: string,
  msgId: number,
  command: string,
  clientCwd: string
): Promise<void> {
  const session = getSession(sessionId)
  if (!session) {
    send(ws, {
      kind: "error",
      msgId,
      message: "no active session — please reconnect",
    })
    return
  }

  // Resolve the client's cwd against the session home and validate
  // containment. If the cwd is bogus we fall back to home so docker
  // commands still have *some* directory to spawn in.
  const cwdAbs = safePath(session, clientCwd) ?? session.homeDir

  // ─── try native first ─────────────────────────────────────────────
  // cd, ls, pwd, cat, mkdir, rm, … run entirely in node and don't spawn
  // a child process. they return synchronously and we stream back the
  // result as a normal done message (with an optional cwdUpdate).
  const native = runNative(session, clientCwd, command)
  if (native) {
    log(`native [${session.id}@${clientCwd || "~"}] ${command}`)
    if (native.stdout) {
      send(ws, { kind: "stream", msgId, stream: "stdout", text: native.stdout })
    }
    if (native.stderr) {
      send(ws, { kind: "stream", msgId, stream: "stderr", text: native.stderr })
    }
    send(ws, {
      kind: "done",
      msgId,
      exitCode: native.exitCode,
      ...(native.cwdUpdate !== undefined
        ? { cwdUpdate: native.cwdUpdate }
        : {}),
    })
    return
  }

  // ─── otherwise try a docker template ──────────────────────────────
  const matched = matchTemplate(command)
  if (!matched) {
    const trimmed = command.trim()

    let hint =
      "supported examples: `docker images`, `docker ps`, `docker build -t greeter .`, `docker run -p 3000:3000 greeter`"

    if (/^docker\s+run\s+[a-z][\w-]{0,30}\s*$/i.test(trimmed)) {
      const image = trimmed.split(/\s+/)[2]?.toLowerCase()
      hint = `did you mean: docker run -p 3000:3000 ${image}?`
    } else if (/^docker\s+build\s+[a-z][\w-]{0,30}\s*$/i.test(trimmed)) {
      const image = trimmed.split(/\s+/)[2]?.toLowerCase()
      hint = `did you mean: docker build -t ${image} .?`
    }

    send(ws, {
      kind: "reject",
      msgId,
      reason: `command not in scope: ${command}`,
      hint,
    })
    return
  }

  const built = matched.template.build(matched.match, session, {
    requestCwd: cwdAbs,
  })
  if (!built.ok) {
    send(ws, {
      kind: "reject",
      msgId,
      reason: built.reason,
      hint: built.hint,
    })
    return
  }

  const cmd = built.cmd
  log(
    `run [${session.id}@${clientCwd || "~"}] ${cmd.bin} ${cmd.args.join(" ")}`
  )

  if (cmd.preface) {
    send(ws, {
      kind: "stream",
      msgId,
      stream: "stdout",
      text: `${cmd.preface}\n`,
    })
  }

  try {
    const result = await runStreaming(
      {
        cmd: [cmd.bin, ...cmd.args],
        // templates that don't pin a cwd inherit the request cwd
        cwd: cmd.cwd ?? cwdAbs,
        env: cmd.env,
        timeoutMs: cmd.timeoutMs,
        onSpawn: (proc) => {
          activeProcs.set(msgId, proc)
        },
      },
      (stream, text) => {
        send(ws, { kind: "stream", msgId, stream, text })
      }
    )

    activeProcs.delete(msgId)

    if (result.timedOut) {
      send(ws, {
        kind: "stream",
        msgId,
        stream: "stderr",
        text: `\n[killed: timed out after ${cmd.timeoutMs}ms]\n`,
      })
    }

    if (result.exitCode === 0 && cmd.epilogue) {
      send(ws, {
        kind: "stream",
        msgId,
        stream: "stdout",
        text: `${cmd.epilogue}\n`,
      })
    }

    send(ws, { kind: "done", msgId, exitCode: result.exitCode })
  } catch (err) {
    activeProcs.delete(msgId)
    log(`run failed [${session.id}]`, err)
    send(ws, {
      kind: "error",
      msgId,
      message: err instanceof Error ? err.message : String(err),
    })
  }
}

// ─── cors ────────────────────────────────────────────────────────────────
//
// dev mode runs vite on :5173 and bun on :4000, so every fetch is
// cross-origin. we allow any origin (dev sandbox, no auth) and reflect
// the standard set of headers/methods. if you ever ship this behind a
// reverse proxy, drop this and serve both apps from the same origin.

const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-max-age": "86400",
}

function withCors(res: Response): Response {
  const headers = new Headers(res.headers)
  for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v)
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  })
}

// ─── server ──────────────────────────────────────────────────────────────

const server = Bun.serve<SocketData, never>({
  port: PORT,
  async fetch(req, server) {
    const url = new URL(req.url)

    // CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS })
    }

    if (url.pathname === "/_health") {
      return withCors(new Response("ok"))
    }

    if (url.pathname === "/_debug") {
      // tiny readonly snapshot for verifying multi-user namespacing
      const sessions = listSessions().map((s) => ({
        id: s.id,
        username: s.username,
        home: s.homeDir,
        projectDir: s.projectDir,
        connected: !!s.socket,
        createdAt: new Date(s.createdAt).toISOString(),
      }))
      return withCors(
        new Response(JSON.stringify({ sessions }, null, 2), {
          headers: { "content-type": "application/json" },
        })
      )
    }

    if (url.pathname === "/search") {
      return withCors(await handleSearch(req))
    }

    if (url.pathname === "/reader") {
      return withCors(await handleReader(req))
    }

    if (url.pathname === "/ws") {
      const upgraded = server.upgrade(req, {
        data: { sessionId: null } satisfies SocketData,
      })
      if (upgraded) return undefined
      return new Response("upgrade failed", { status: 426 })
    }

    return withCors(new Response("dockerlab backend", { status: 200 }))
  },

  websocket: {
    open(_ws) {
      log("ws open")
    },

    message(ws, raw) {
      if (typeof raw !== "string") return
      let msg: ClientMessage
      try {
        msg = JSON.parse(raw) as ClientMessage
      } catch {
        send(ws, { kind: "error", message: "invalid json" })
        return
      }

      switch (msg.kind) {
        case "hello": {
          const session = getOrCreateSession(msg.username, WORKSPACE_ROOT)
          ws.data.sessionId = session.id
          attachSocket(session.id, ws)
          // if a cleanup was queued from a previous disconnect, cancel it —
          // the user is back within the grace period.
          cancelCleanup(session.id)
          log(`hello: ${msg.username} → session ${session.id}`)
          send(ws, {
            kind: "hello",
            msgId: msg.msgId,
            sessionId: session.id,
            username: session.username,
            home: session.homeDir,
            host: HOST_INFO,
          })
          return
        }

        case "run": {
          if (!ws.data.sessionId) {
            send(ws, {
              kind: "error",
              msgId: msg.msgId,
              message: "must send hello before run",
            })
            return
          }
          // fire and forget — handler streams its own replies
          void handleRun(
            ws,
            ws.data.sessionId,
            msg.msgId,
            msg.command,
            msg.cwd ?? ""
          )
          return
        }

        case "lookup_port": {
          if (!ws.data.sessionId) {
            send(ws, {
              kind: "error",
              msgId: msg.msgId,
              message: "must send hello before lookup_port",
            })
            return
          }
          const hostPort =
            lookupHostPort(ws.data.sessionId, msg.guestPort) ?? null
          send(ws, {
            kind: "port_lookup",
            msgId: msg.msgId,
            guestPort: msg.guestPort,
            hostPort,
          })
          return
        }

        case "cancel": {
          // cancel is handled by handleRun via the activeProcs map
          const proc = activeProcs.get(msg.targetId)
          if (proc) {
            try {
              proc.kill()
            } catch {
              /* already exited */
            }
          }
          return
        }

        case "list_dir": {
          const session = ws.data.sessionId
            ? getSession(ws.data.sessionId)
            : undefined
          if (!session) {
            send(ws, {
              kind: "error",
              msgId: msg.msgId,
              message: "no active session",
            })
            return
          }
          const result = listDirectory(session, msg.path)
          if ("error" in result) {
            send(ws, {
              kind: "error",
              msgId: msg.msgId,
              message: result.error,
            })
            return
          }
          send(ws, {
            kind: "dir_listing",
            msgId: msg.msgId,
            path: msg.path,
            entries: result.entries,
          })
          return
        }

        case "read_file": {
          const session = ws.data.sessionId
            ? getSession(ws.data.sessionId)
            : undefined
          if (!session) {
            send(ws, {
              kind: "error",
              msgId: msg.msgId,
              message: "no active session",
            })
            return
          }
          const result = readFileSafe(session, msg.path)
          if ("error" in result) {
            send(ws, {
              kind: "error",
              msgId: msg.msgId,
              message: result.error,
            })
            return
          }
          send(ws, {
            kind: "file_contents",
            msgId: msg.msgId,
            path: msg.path,
            content: result.content,
            language: result.language,
          })
          return
        }

        case "write_file": {
          const session = ws.data.sessionId
            ? getSession(ws.data.sessionId)
            : undefined
          if (!session) {
            send(ws, {
              kind: "error",
              msgId: msg.msgId,
              message: "no active session",
            })
            return
          }
          const result = writeFileSafe(session, msg.path, msg.content)
          if ("error" in result) {
            send(ws, {
              kind: "error",
              msgId: msg.msgId,
              message: result.error,
            })
            return
          }
          send(ws, {
            kind: "write_ok",
            msgId: msg.msgId,
            path: msg.path,
          })
          return
        }

        case "list_containers": {
          const session = ws.data.sessionId
            ? getSession(ws.data.sessionId)
            : undefined
          if (!session) {
            send(ws, {
              kind: "error",
              msgId: msg.msgId,
              message: "no active session",
            })
            return
          }
          void listInventory(session).then(
            ({ containers, images }) => {
              send(ws, {
                kind: "container_list",
                msgId: msg.msgId,
                containers,
                images,
              })
            },
            (err) => {
              send(ws, {
                kind: "error",
                msgId: msg.msgId,
                message: err instanceof Error ? err.message : String(err),
              })
            }
          )
          return
        }

        case "container_stats": {
          const session = ws.data.sessionId
            ? getSession(ws.data.sessionId)
            : undefined
          if (!session) {
            send(ws, {
              kind: "error",
              msgId: msg.msgId,
              message: "no active session",
            })
            return
          }
          void getContainerStats(session, msg.name).then(
            (result) => {
              if (result && typeof result === "object" && "error" in result) {
                send(ws, {
                  kind: "error",
                  msgId: msg.msgId,
                  message: result.error,
                })
                return
              }
              send(ws, {
                kind: "container_stats_reply",
                msgId: msg.msgId,
                sample: result,
              })
            },
            (err) => {
              send(ws, {
                kind: "error",
                msgId: msg.msgId,
                message: err instanceof Error ? err.message : String(err),
              })
            }
          )
          return
        }

        case "container_ls": {
          const session = ws.data.sessionId
            ? getSession(ws.data.sessionId)
            : undefined
          if (!session) {
            send(ws, {
              kind: "error",
              msgId: msg.msgId,
              message: "no active session",
            })
            return
          }
          void containerLs(session, msg.name, msg.path).then(
            (result) => {
              if ("error" in result) {
                send(ws, {
                  kind: "error",
                  msgId: msg.msgId,
                  message: result.error,
                })
                return
              }
              send(ws, {
                kind: "container_ls_reply",
                msgId: msg.msgId,
                path: result.path,
                entries: result.entries,
              })
            },
            (err) => {
              send(ws, {
                kind: "error",
                msgId: msg.msgId,
                message: err instanceof Error ? err.message : String(err),
              })
            }
          )
          return
        }

        case "container_exec": {
          const session = ws.data.sessionId
            ? getSession(ws.data.sessionId)
            : undefined
          if (!session) {
            send(ws, {
              kind: "error",
              msgId: msg.msgId,
              message: "no active session",
            })
            return
          }
          void containerExec(session, msg.name, msg.command).then(
            (result) => {
              if ("error" in result) {
                send(ws, {
                  kind: "error",
                  msgId: msg.msgId,
                  message: result.error,
                })
                return
              }
              send(ws, {
                kind: "container_exec_reply",
                msgId: msg.msgId,
                stdout: result.stdout,
                stderr: result.stderr,
                exitCode: result.exitCode,
              })
            },
            (err) => {
              send(ws, {
                kind: "error",
                msgId: msg.msgId,
                message: err instanceof Error ? err.message : String(err),
              })
            }
          )
          return
        }
      }
    },

    close(ws) {
      const id = ws.data.sessionId
      if (id) {
        detachSocket(id)
        const session = getSession(id)
        if (session) {
          // schedule the sweep — cancelled if the user reconnects
          scheduleCleanup(session, () => {
            removeSession(session.id, WORKSPACE_ROOT)
          })
        }
        log(`ws close (session ${id} grace started)`)
      } else {
        log("ws close (no session)")
      }
    },
  },
})

log(`listening on http://localhost:${server.port}`)
log(`workspaces at ${WORKSPACE_ROOT}`)
