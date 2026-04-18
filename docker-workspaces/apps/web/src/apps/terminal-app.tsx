import * as React from "react"

import { useDaemon } from "@/state/daemon"
import { usePlaythrough } from "@/state/playthrough"
import { useSession } from "@/state/session"
import { useWindows } from "@/state/windows"

// ─────────────────────────────────────────────────────────────────────────
// terminal app
//
// thin frontend over the daemon's run channel. owns:
//   • a buffer of rendered lines (the scrollback)
//   • a single input line + history recall (up/down arrows)
//   • the **client-side cwd** for this terminal (relative to home)
//
// every command we forward to the daemon carries our local cwd. native
// shell commands (cd, ls, cat, mkdir, …) are handled server-side and may
// reply with a `cwdUpdate` field, which we adopt as our new local cwd.
//
// we intercept exactly two commands client-side:
//   • `clear` — wipe the scrollback (purely cosmetic, no need for a
//     server round-trip)
//   • `code [path]` — open the path in the code app via the windows
//     context. matches the `code .` muscle memory of real VS Code.
//
// everything else (including help/whoami/echo/cd/ls) goes to the server.
// ─────────────────────────────────────────────────────────────────────────

type Line =
  | { kind: "prompt"; user: string; cwd: string; cmd: string }
  | { kind: "out"; text: string; tone?: "ok" | "warn" | "err" | "dim" }

const BANNER = "dockerlab — type 'help' to see commands"

/** Convert a relative-to-home cwd into a `~`-prefixed display string. */
function displayCwd(cwd: string): string {
  return cwd ? `~/${cwd}` : "~"
}

export function TerminalApp() {
  const { user } = useSession()
  const daemon = useDaemon()
  const playthrough = usePlaythrough()
  const { openFolderInCode, openFileInCode } = useWindows()
  const username = user?.name ?? "guest"

  const [history, setHistory] = React.useState<Line[]>(() => [
    { kind: "out", text: BANNER, tone: "dim" },
    {
      kind: "out",
      text: "you're in your home directory. try `ls`, then `cd projects/greeter-api`.",
      tone: "dim",
    },
  ])
  // Terminal cwd, relative to the session's home directory. Empty string
  // means home itself ("~"). Updated by the server's cwdUpdate replies.
  const [cwd, setCwd] = React.useState<string>("")
  const [input, setInput] = React.useState("")
  const [recall, setRecall] = React.useState<string[]>([])
  const [recallIdx, setRecallIdx] = React.useState<number | null>(null)
  const [busy, setBusy] = React.useState(false)
  const abortRef = React.useRef<AbortController | null>(null)

  const inputRef = React.useRef<HTMLInputElement>(null)
  const scrollRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    inputRef.current?.focus()
  }, [])

  React.useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    })
  }, [history])

  const append = React.useCallback((lines: Line[]) => {
    setHistory((h) => [...h, ...lines])
  }, [])

  // Append a chunk of streamed text by splitting on newlines so each line
  // becomes its own row in the buffer (matching how the rest of the
  // terminal renders).
  const appendStream = React.useCallback(
    (text: string, stream: "stdout" | "stderr") => {
      const tone = stream === "stderr" ? "warn" : undefined
      const lines = text.split("\n")
      // Drop a trailing empty string from "foo\n".split("\n") so we don't
      // emit a phantom blank row, but keep intentional blank lines mid-output.
      if (lines[lines.length - 1] === "") lines.pop()
      if (lines.length === 0) return
      append(lines.map((l) => ({ kind: "out", text: l, tone })))
    },
    [append]
  )

  /**
   * Resolve a path the user typed into a code/cd command into a
   * relative-to-home form, joining with the current cwd if relative. We
   * keep the same rules as the server's native handler so cwd math is
   * consistent on both sides; this implementation is a strict subset.
   */
  const resolveAgainstCwd = React.useCallback(
    (target: string): string => {
      let normalized = target
      if (
        normalized === "~" ||
        normalized.startsWith("~/") ||
        normalized.startsWith("~\\")
      ) {
        normalized = normalized.slice(1).replace(/^[/\\]+/, "")
        return normalize(normalized)
      }
      if (normalized.startsWith("/") || normalized.startsWith("\\")) {
        normalized = normalized.replace(/^[/\\]+/, "")
        return normalize(normalized)
      }
      const joined = cwd ? `${cwd}/${normalized}` : normalized
      return normalize(joined)
    },
    [cwd]
  )

  const run = React.useCallback(
    async (raw: string) => {
      const cmd = raw.trim()
      append([{ kind: "prompt", user: username, cwd: displayCwd(cwd), cmd }])

      if (!cmd) return

      // ─── client-side intercepts ───────────────────────────────────────
      if (cmd === "clear") {
        setHistory([])
        return
      }

      // `code [path]` → open in the code app. mirrors VS Code's `code .`.
      // when the path resolves to a directory we openFolderInCode; when it
      // resolves to a file we openFileInCode (which adopts the parent dir
      // as the explorer root). without an arg, opens the current cwd.
      if (cmd === "code" || cmd.startsWith("code ")) {
        const arg = cmd === "code" ? "." : cmd.slice(5).trim() || "."
        const target = resolveAgainstCwd(arg)
        // figure out if the target is a directory by listing it
        const dirCheck = await daemon.listDir(target)
        if (dirCheck.ok) {
          openFolderInCode(target)
          append([{ kind: "out", text: `opened ${target || "~"} in code`, tone: "dim" }])
        } else {
          // not a dir — treat it as a file open
          const fileCheck = await daemon.readFile(target)
          if (!fileCheck.ok) {
            append([{ kind: "out", text: `code: ${arg}: ${fileCheck.error}`, tone: "err" }])
            return
          }
          openFileInCode(target)
          append([{ kind: "out", text: `opened ${target} in code`, tone: "dim" }])
        }
        return
      }

      // ─── everything else goes to the server ──────────────────────────
      if (daemon.connection !== "open") {
        append([
          {
            kind: "out",
            text: `daemon is ${daemon.connection} — try again in a moment`,
            tone: "err",
          },
        ])
        return
      }

      const ac = new AbortController()
      abortRef.current = ac
      setBusy(true)
      const result = await daemon.run(
        cmd,
        cwd,
        ({ stream, text }) => {
          appendStream(text, stream)
        },
        ac.signal
      )
      abortRef.current = null
      setBusy(false)

      // adopt any cwd update from a successful `cd`
      if (result.status === "ok" && result.cwdUpdate !== undefined) {
        setCwd(result.cwdUpdate)
      }

      // tell the playthrough about this command so the welcome checklist
      // can advance. only successful runs count.
      if (result.status === "ok") {
        playthrough.recordCommand(cmd, result.exitCode)
      }

      if (result.status === "rejected") {
        append([
          { kind: "out", text: result.reason, tone: "err" },
          ...(result.hint
            ? [{ kind: "out" as const, text: result.hint, tone: "dim" as const }]
            : []),
        ])
        return
      }
      if (result.status === "error") {
        append([
          { kind: "out", text: `error: ${result.message}`, tone: "err" },
        ])
        return
      }
      if (result.status === "ok" && result.exitCode !== 0) {
        append([
          {
            kind: "out",
            text: `exit ${result.exitCode}`,
            tone: "warn",
          },
        ])
      }
    },
    [
      username,
      append,
      appendStream,
      cwd,
      daemon,
      playthrough,
      openFolderInCode,
      openFileInCode,
      resolveAgainstCwd,
    ]
  )

  const onKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Ctrl+C cancels the in-flight run (like a real terminal)
    if (e.ctrlKey && e.key.toLowerCase() === "c" && busy) {
      e.preventDefault()
      abortRef.current?.abort()
      append([{ kind: "out", text: "^C", tone: "dim" }])
      return
    }
    if (busy) {
      // ignore enter while a command is in flight; arrow keys still work
      if (e.key === "Enter") {
        e.preventDefault()
        return
      }
    }
    if (e.key === "Enter") {
      e.preventDefault()
      const cmd = input
      setInput("")
      if (cmd.trim()) {
        setRecall((r) => [...r, cmd])
        setRecallIdx(null)
      }
      await run(cmd)
      return
    }
    if (e.key === "ArrowUp") {
      e.preventDefault()
      if (recall.length === 0) return
      const next =
        recallIdx === null ? recall.length - 1 : Math.max(0, recallIdx - 1)
      setRecallIdx(next)
      setInput(recall[next])
      return
    }
    if (e.key === "ArrowDown") {
      e.preventDefault()
      if (recallIdx === null) return
      const next = recallIdx + 1
      if (next >= recall.length) {
        setRecallIdx(null)
        setInput("")
      } else {
        setRecallIdx(next)
        setInput(recall[next])
      }
      return
    }
    if (e.ctrlKey && e.key.toLowerCase() === "l") {
      e.preventDefault()
      setHistory([])
    }
  }

  const connectionDot =
    daemon.connection === "open"
      ? "bg-emerald-400"
      : daemon.connection === "connecting"
        ? "bg-amber-300 animate-pulse"
        : "bg-red-400"

  return (
    <div
      // The terminal stays "always dark" in both themes — that's how
      // every real terminal app behaves. Only the window chrome around
      // it follows the user's light/dark setting.
      className="flex min-h-0 flex-1 cursor-text flex-col font-mono text-[12px] text-white/85"
      style={{ background: "oklch(0.13 0.01 260)" }}
      onClick={() => inputRef.current?.focus()}
    >
      {/* status strip */}
      <div className="flex items-center justify-between border-b border-white/8 px-3 py-1 text-[10px] text-white/45">
        <div className="flex items-center gap-1.5">
          <span className={`size-1.5 rounded-full ${connectionDot}`} />
          <span>daemon · {daemon.connection}</span>
          {daemon.sessionId && (
            <>
              <span className="text-white/20">·</span>
              <span>session {daemon.sessionId}</span>
            </>
          )}
          <span className="text-white/20">·</span>
          <span>{displayCwd(cwd)}</span>
        </div>
        {busy && (
          <div className="flex items-center gap-2">
            <span className="text-white/55">running…</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                abortRef.current?.abort()
              }}
              className="rounded border border-red-400/30 bg-red-400/10 px-1.5 py-0.5 text-[9px] font-medium text-red-300/85 hover:bg-red-400/20"
            >
              cancel · ⌃C
            </button>
          </div>
        )}
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {history.map((line, i) => {
          if (line.kind === "prompt") {
            return (
              <div key={i} className="whitespace-pre-wrap">
                <span className="text-white">{line.user}</span>
                <span className="text-white/30">@</span>
                <span className="text-white/65">dockerlab</span>
                <span className="text-white/30">:</span>
                <span className="text-primary/85">{line.cwd}</span>
                <span className="text-white/30">$ </span>
                <span className="text-white/90">{line.cmd}</span>
              </div>
            )
          }
          const cls =
            line.tone === "err"
              ? "text-red-400/90"
              : line.tone === "ok"
                ? "text-white"
                : line.tone === "warn"
                  ? "text-primary"
                  : line.tone === "dim"
                    ? "text-white/45"
                    : "text-white/85"
          return (
            <div key={i} className={`whitespace-pre-wrap ${cls}`}>
              {line.text}
            </div>
          )
        })}

        {/* live prompt — hidden entirely while a command is running so
             streaming output doesn't have a fake "ready" prompt below it */}
        {!busy && (
        <div className="mt-1 flex items-center gap-1 whitespace-pre">
          <span className="text-white">{username}</span>
          <span className="text-white/30">@</span>
          <span className="text-white/65">dockerlab</span>
          <span className="text-white/30">:</span>
          <span className="text-primary/85">{displayCwd(cwd)}</span>
          <span className="text-white/30">$</span>
          <span className="relative flex-1">
            {/* The input uses transparent caret color so we can render our
                own blinking block cursor — avoids the double-cursor problem
                of having both the native input caret AND our custom ▍. */}
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              spellCheck={false}
              autoComplete="off"
              className="w-full bg-transparent pl-1 text-white/90 caret-transparent outline-none"
            />
            {input.length === 0 && (
              <span className="caret-blink absolute top-0 left-1 text-white/80">
                ▍
              </span>
            )}
          </span>
        </div>
        )}
      </div>
    </div>
  )
}

/**
 * Normalize a relative-to-home path: collapse `..`, drop empty segments,
 * never escape the root. Mirrors `path.resolve` semantics but stays in
 * the relative-to-home domain. Returns "" for the root itself.
 */
function normalize(path: string): string {
  const parts = path.replace(/[\\]/g, "/").split("/").filter(Boolean)
  const out: string[] = []
  for (const part of parts) {
    if (part === ".") continue
    if (part === "..") {
      out.pop()
      continue
    }
    out.push(part)
  }
  return out.join("/")
}
