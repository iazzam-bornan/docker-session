import * as React from "react"

import type { DirEntry } from "@workspace/protocol"
import { cn } from "@workspace/ui/lib/utils"

import { useContextMenu, type ContextMenuItem } from "@/state/context-menu"
import { useDaemon } from "@/state/daemon"
import { usePlaythrough } from "@/state/playthrough"
import { useWindows } from "@/state/windows"
import { languageFromName } from "@/lib/syntax"

// ─────────────────────────────────────────────────────────────────────────
// files app — real filesystem browser
//
// nautilus-ish layout: top toolbar with back/forward/up + breadcrumb +
// search + view toggle, sidebar with shortcuts (home / common folders /
// recent), main pane with grid or list of entries.
//
// the user is always inside the home directory of their session (a real
// directory on disk under apps/server/workspaces/<id>/home/). they navigate
// folders by double-clicking them. files are *opened* in the code app via
// the cross-app intent system; the files app no longer has its own editor.
//
// state:
//   • cwd is a path relative to home ("" = home, "projects/greeter-api")
//   • back/forward stacks track navigation history (real file managers
//     have these)
//   • per-cwd entries are cached so going Back is instant
// ─────────────────────────────────────────────────────────────────────────

const VIEW_KEY = "dockerlab.files.view.v1"

type ViewMode = "grid" | "list"
type Tab = "home" | "desktop" | "documents" | "downloads" | "projects" | "recent"

// each shortcut targets a known path under home. picking one is a
// shorthand for typing it into the location bar.
const SHORTCUT_PATH: Record<Exclude<Tab, "recent">, string> = {
  home: "",
  desktop: "Desktop",
  documents: "Documents",
  downloads: "Downloads",
  projects: "projects",
}

// ─── icons ───────────────────────────────────────────────────────────────

const SVG_PROPS = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
}

const ArrowLeft = () => (
  <svg {...SVG_PROPS} className="size-4">
    <path d="M19 12H5M12 19l-7-7 7-7" />
  </svg>
)
const ArrowRight = () => (
  <svg {...SVG_PROPS} className="size-4">
    <path d="M5 12h14M12 5l7 7-7 7" />
  </svg>
)
const ArrowUpIcon = () => (
  <svg {...SVG_PROPS} className="size-4">
    <path d="M12 19V5M5 12l7-7 7 7" />
  </svg>
)
const RefreshIcon = () => (
  <svg {...SVG_PROPS} className="size-4">
    <path d="M3 12a9 9 0 0 1 15.5-6.3L21 8" />
    <path d="M21 3v5h-5" />
    <path d="M21 12a9 9 0 0 1-15.5 6.3L3 16" />
    <path d="M3 21v-5h5" />
  </svg>
)
const SearchIcon = () => (
  <svg {...SVG_PROPS} className="size-3.5">
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
)
const GridIcon = () => (
  <svg {...SVG_PROPS} className="size-4">
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </svg>
)
const ListIcon = () => (
  <svg {...SVG_PROPS} className="size-4">
    <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
  </svg>
)
const HomeIcon = () => (
  <svg {...SVG_PROPS} className="size-4">
    <path d="M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-7H10v7H4a1 1 0 0 1-1-1Z" />
  </svg>
)
const DesktopIconSvg = () => (
  <svg {...SVG_PROPS} className="size-4">
    <rect x="3" y="4" width="18" height="12" rx="1" />
    <path d="M8 20h8M12 16v4" />
  </svg>
)
const DocumentsIcon = () => (
  <svg {...SVG_PROPS} className="size-4">
    <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Z" />
    <path d="M14 3v6h6" />
  </svg>
)
const DownloadsIcon = () => (
  <svg {...SVG_PROPS} className="size-4">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
  </svg>
)
const ProjectsIcon = () => (
  <svg {...SVG_PROPS} className="size-4">
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
  </svg>
)
const ClockIcon = () => (
  <svg {...SVG_PROPS} className="size-4">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
)
const CodeOpenIcon = () => (
  <svg {...SVG_PROPS} className="size-4">
    <path d="m16 18 6-6-6-6M8 6l-6 6 6 6" />
  </svg>
)

// ─── colorful per-type file icon ─────────────────────────────────────────

type FileTypeStyle = {
  bg: string
  fg: string
  label: string
}

function fileTypeStyle(name: string, language: string): FileTypeStyle {
  const lower = name.toLowerCase()
  if (lower === "dockerfile" || language === "dockerfile") {
    return {
      bg: "linear-gradient(135deg, oklch(0.55 0.18 240), oklch(0.4 0.18 250))",
      fg: "oklch(0.98 0 0)",
      label: "🐳",
    }
  }
  if (
    lower.includes(".compose") ||
    lower.endsWith("docker-compose.yml") ||
    lower.endsWith("docker-compose.yaml")
  ) {
    return {
      bg: "linear-gradient(135deg, oklch(0.55 0.18 220), oklch(0.4 0.18 235))",
      fg: "oklch(0.98 0 0)",
      label: "DC",
    }
  }
  if (language === "javascript") {
    return {
      bg: "linear-gradient(135deg, oklch(0.85 0.16 95), oklch(0.7 0.18 80))",
      fg: "oklch(0.18 0.02 80)",
      label: "JS",
    }
  }
  if (language === "typescript") {
    return {
      bg: "linear-gradient(135deg, oklch(0.55 0.18 240), oklch(0.42 0.18 250))",
      fg: "oklch(0.98 0 0)",
      label: "TS",
    }
  }
  if (language === "json") {
    return {
      bg: "linear-gradient(135deg, oklch(0.65 0.04 80), oklch(0.5 0.04 80))",
      fg: "oklch(0.98 0 0)",
      label: "{}",
    }
  }
  if (language === "yaml") {
    return {
      bg: "linear-gradient(135deg, oklch(0.65 0.18 25), oklch(0.5 0.18 15))",
      fg: "oklch(0.98 0 0)",
      label: "YML",
    }
  }
  if (language === "markdown") {
    return {
      bg: "linear-gradient(135deg, oklch(0.6 0.15 200), oklch(0.45 0.15 215))",
      fg: "oklch(0.98 0 0)",
      label: "MD",
    }
  }
  if (lower === ".dockerignore" || lower === ".gitignore" || language === "ini") {
    return {
      bg: "linear-gradient(135deg, oklch(0.55 0.04 60), oklch(0.4 0.04 60))",
      fg: "oklch(0.98 0 0)",
      label: "··",
    }
  }
  return {
    bg: "linear-gradient(135deg, oklch(0.6 0.02 250), oklch(0.45 0.02 250))",
    fg: "oklch(0.98 0 0)",
    label: "·",
  }
}

function FolderTile({ size = 48 }: { size?: number }) {
  // Clean flat folder — blue tones, no harsh gradient. Inspired by
  // macOS/GNOME style: a solid body with a slightly lighter tab.
  return (
    <svg
      viewBox="0 0 48 40"
      className="shrink-0"
      style={{ width: size, height: Math.round(size * 0.83) }}
    >
      {/* body */}
      <path
        d="M2 12a2 2 0 0 1 2-2h40a2 2 0 0 1 2 2v24a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V12Z"
        fill="oklch(0.58 0.14 245)"
      />
      {/* tab */}
      <path
        d="M2 8a2 2 0 0 1 2-2h12a2 2 0 0 1 1.6.8L20 10H2V8Z"
        fill="oklch(0.64 0.14 245)"
      />
      {/* top edge highlight */}
      <path
        d="M2 10h44a2 2 0 0 1 2 2H0a2 2 0 0 1 2-2Z"
        fill="oklch(0.64 0.12 245)"
      />
    </svg>
  )
}

function FileTile({
  name,
  language,
  size = 48,
}: {
  name: string
  language: string
  size?: number
}) {
  const style = fileTypeStyle(name, language)
  return (
    <div
      className="grid shrink-0 place-items-center rounded-lg shadow-sm"
      style={{
        width: size,
        height: Math.round(size * 1.1),
        background: style.bg,
        color: style.fg,
      }}
    >
      <span
        className="font-mono text-[10px] font-bold tracking-tight"
        style={{ fontSize: Math.round(size * 0.22) }}
      >
        {style.label}
      </span>
    </div>
  )
}

// ─── small helpers ───────────────────────────────────────────────────────

/** "" or "foo" or "foo/bar/baz" → ["foo","bar","baz"] (empty for home). */
function pathSegments(path: string): string[] {
  return path ? path.split("/").filter(Boolean) : []
}

/** Join a parent dir and a child name into a relative-to-home path. */
function joinPath(parent: string, child: string): string {
  return parent ? `${parent}/${child}` : child
}

/** Drop the last segment, returning "" for home. */
function parentOf(path: string): string {
  const idx = path.lastIndexOf("/")
  return idx >= 0 ? path.slice(0, idx) : ""
}

/**
 * Wrap a name in double quotes if it contains spaces. The server's
 * native command tokenizer supports double-quoted segments. We don't
 * escape internal quotes — the user simply can't use them in names
 * via the file manager (the prompt validation rejects exotic chars).
 */
function quote(name: string): string {
  return name.includes(" ") ? `"${name}"` : name
}

function loadView(): ViewMode {
  try {
    const raw = localStorage.getItem(VIEW_KEY)
    if (raw === "grid" || raw === "list") return raw
  } catch {
    /* ignore */
  }
  return "grid"
}

function persistView(view: ViewMode): void {
  try {
    localStorage.setItem(VIEW_KEY, view)
  } catch {
    /* ignore */
  }
}

// ─── main ────────────────────────────────────────────────────────────────

type DirState =
  | { kind: "loading" }
  | { kind: "ok"; entries: DirEntry[] }
  | { kind: "error"; message: string }

export function FilesApp() {
  const daemon = useDaemon()
  const playthrough = usePlaythrough()
  const { open: openApp, openFileInCode, openFolderInCode } = useWindows()
  const ctx = useContextMenu()

  React.useEffect(() => {
    playthrough.markFilesOpened()
  }, [playthrough])

  // current location, back/forward stacks
  const [cwd, setCwd] = React.useState<string>("")
  const [back, setBack] = React.useState<string[]>([])
  const [forward, setForward] = React.useState<string[]>([])

  // selection + search
  const [selected, setSelected] = React.useState<string | null>(null)
  const [view, setView] = React.useState<ViewMode>(() => loadView())
  const [search, setSearch] = React.useState("")

  // per-cwd dir cache so going Back is instant
  const [cache, setCache] = React.useState<Map<string, DirState>>(
    () => new Map()
  )
  // memoize the lookup so the visibleEntries useMemo below doesn't re-run
  // every render — `cache.get(cwd) ?? { kind: "loading" }` would otherwise
  // produce a fresh object on every render of the parent.
  const current = React.useMemo<DirState>(
    () => cache.get(cwd) ?? { kind: "loading" },
    [cache, cwd]
  )

  React.useEffect(() => {
    persistView(view)
  }, [view])

  // ─── fetch the current cwd if it isn't cached ─────────────────────────
  const fetchDir = React.useCallback(
    async (path: string, force = false) => {
      if (daemon.connection !== "open") return
      if (!force && cache.get(path)?.kind === "ok") return
      setCache((c) => {
        const next = new Map(c)
        next.set(path, { kind: "loading" })
        return next
      })
      const res = await daemon.listDir(path || ".")
      setCache((c) => {
        const next = new Map(c)
        if (res.ok) {
          const sorted = [...res.entries].sort((a, b) => {
            if (a.type !== b.type) return a.type === "dir" ? -1 : 1
            return a.name.localeCompare(b.name)
          })
          next.set(path, { kind: "ok", entries: sorted })
        } else {
          next.set(path, { kind: "error", message: res.error })
        }
        return next
      })
    },
    [daemon, cache]
  )

  // initial fetch + whenever cwd changes (cache hit makes this a no-op)
  React.useEffect(() => {
    void fetchDir(cwd)
    // intentionally not depending on fetchDir — it captures the cache and
    // would cause an extra fetch on every cache update
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cwd, daemon.connection])

  // ─── navigation ─────────────────────────────────────────────────────
  const navigateTo = React.useCallback(
    (path: string) => {
      if (path === cwd) return
      setBack((b) => [...b, cwd])
      setForward([])
      setCwd(path)
      setSelected(null)
      setSearch("")
    },
    [cwd]
  )

  const goBack = React.useCallback(() => {
    setBack((b) => {
      if (b.length === 0) return b
      const prev = b[b.length - 1]
      setForward((f) => [cwd, ...f])
      setCwd(prev)
      setSelected(null)
      return b.slice(0, -1)
    })
  }, [cwd])

  const goForward = React.useCallback(() => {
    setForward((f) => {
      if (f.length === 0) return f
      const next = f[0]
      setBack((b) => [...b, cwd])
      setCwd(next)
      setSelected(null)
      return f.slice(1)
    })
  }, [cwd])

  const goUp = React.useCallback(() => {
    if (!cwd) return
    navigateTo(parentOf(cwd))
  }, [cwd, navigateTo])

  const refresh = React.useCallback(() => {
    void fetchDir(cwd, true)
  }, [fetchDir, cwd])

  // ─── opening entries ────────────────────────────────────────────────
  const openEntry = (entry: DirEntry) => {
    if (entry.type === "dir") {
      navigateTo(joinPath(cwd, entry.name))
    } else {
      openFileInCode(joinPath(cwd, entry.name))
    }
  }

  // ─── filesystem operations (via the daemon's native commands) ───────
  // these all run server-side via the same `run` channel the terminal
  // uses, so they go through the same containment/safety checks.

  /** Run a one-off shell command and refresh on success. */
  const runFsCmd = React.useCallback(
    async (command: string) => {
      await daemon.run(command, cwd, () => {})
      // refresh the current view from disk
      void fetchDir(cwd, true)
    },
    [daemon, cwd, fetchDir]
  )

  const promptCreate = React.useCallback(
    async (kind: "file" | "folder") => {
      const name = window.prompt(
        kind === "file" ? "new file name:" : "new folder name:"
      )
      if (!name) return
      // basic name validation — no slashes, no .. — same rules the
      // server's safePath enforces, but checking here lets us show a
      // friendlier error than a generic "outside home"
      if (name.includes("/") || name.includes("\\") || name === "..") {
        window.alert(`invalid name: ${name}`)
        return
      }
      const cmd =
        kind === "file" ? `touch ${quote(name)}` : `mkdir ${quote(name)}`
      await runFsCmd(cmd)
    },
    [runFsCmd]
  )

  const confirmDelete = React.useCallback(
    async (entry: DirEntry) => {
      const ok = window.confirm(
        `delete ${entry.type === "dir" ? "folder" : "file"} "${entry.name}"?` +
          (entry.type === "dir" ? " this removes everything inside it." : "")
      )
      if (!ok) return
      const cmd =
        entry.type === "dir"
          ? `rm -rf ${quote(entry.name)}`
          : `rm ${quote(entry.name)}`
      await runFsCmd(cmd)
    },
    [runFsCmd]
  )

  // ─── context-menu builders ──────────────────────────────────────────
  const onEntryContext = (entry: DirEntry): ContextMenuItem[] => {
    const fullPath = joinPath(cwd, entry.name)
    if (entry.type === "dir") {
      return [
        { kind: "header", label: entry.name },
        { label: "Open", onClick: () => navigateTo(fullPath) },
        {
          label: "Open in Code",
          onClick: () => openFolderInCode(fullPath),
        },
        { kind: "separator" },
        {
          label: "Delete",
          danger: true,
          onClick: () => void confirmDelete(entry),
        },
      ]
    }
    return [
      { kind: "header", label: entry.name },
      { label: "Open in Code", onClick: () => openFileInCode(fullPath) },
      { kind: "separator" },
      {
        label: "Delete",
        danger: true,
        onClick: () => void confirmDelete(entry),
      },
    ]
  }

  const onEmptyContext: ContextMenuItem[] = React.useMemo(
    () => [
      { kind: "header", label: cwd ? `~/${cwd}` : "~" },
      { label: "New File…", onClick: () => void promptCreate("file") },
      { label: "New Folder…", onClick: () => void promptCreate("folder") },
      { kind: "separator" },
      {
        label: "Refresh",
        onClick: () => void fetchDir(cwd, true),
      },
      { kind: "separator" },
      { label: "Open Terminal here", onClick: () => openApp("terminal") },
      { label: "Open in Code", onClick: () => openFolderInCode(cwd) },
    ],
    [cwd, promptCreate, fetchDir, openApp, openFolderInCode]
  )

  // selecting a sidebar tab navigates to its target path
  const onSelectTab = (tab: Tab) => {
    if (tab === "recent") return // not implemented yet
    navigateTo(SHORTCUT_PATH[tab])
  }

  // entries to show in the main pane after applying the search filter
  const visibleEntries: DirEntry[] = React.useMemo(() => {
    if (current.kind !== "ok") return []
    if (!search) return current.entries
    const q = search.toLowerCase()
    return current.entries.filter((e) => e.name.toLowerCase().includes(q))
  }, [current, search])

  // figure out the active sidebar tab from the cwd
  const activeTab: Tab = React.useMemo(() => {
    if (cwd === "") return "home"
    const first = pathSegments(cwd)[0]
    if (first === "Desktop") return "desktop"
    if (first === "Documents") return "documents"
    if (first === "Downloads") return "downloads"
    if (first === "projects") return "projects"
    return "home"
  }, [cwd])

  return (
    <div className="grid min-h-0 flex-1 grid-rows-[auto_1fr] bg-card">
      {/* ── top toolbar ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 border-b border-border bg-card px-3 py-2">
        <ToolbarButton
          title="back"
          disabled={back.length === 0}
          onClick={goBack}
        >
          <ArrowLeft />
        </ToolbarButton>
        <ToolbarButton
          title="forward"
          disabled={forward.length === 0}
          onClick={goForward}
        >
          <ArrowRight />
        </ToolbarButton>
        <ToolbarButton
          title="up one directory"
          disabled={!cwd}
          onClick={goUp}
        >
          <ArrowUpIcon />
        </ToolbarButton>
        <ToolbarButton title="refresh" onClick={refresh}>
          <RefreshIcon />
        </ToolbarButton>

        {/* breadcrumb */}
        <Breadcrumb cwd={cwd} onNavigate={navigateTo} />

        {/* search */}
        <div className="flex h-7 w-44 items-center gap-2 rounded-md border border-border bg-surface-sunken px-2.5 font-mono text-[11px]">
          <SearchIcon />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="filter…"
            className="flex-1 bg-transparent text-foreground placeholder:text-foreground/35 outline-none"
          />
        </div>

        {/* view toggle */}
        <div className="flex items-center gap-0.5 rounded-md border border-border bg-surface-sunken p-0.5">
          <button
            type="button"
            onClick={() => setView("grid")}
            title="grid view"
            className={cn(
              "grid size-6 place-items-center rounded transition",
              view === "grid"
                ? "bg-surface-elevated text-foreground"
                : "text-foreground/55 hover:text-foreground/85"
            )}
          >
            <GridIcon />
          </button>
          <button
            type="button"
            onClick={() => setView("list")}
            title="list view"
            className={cn(
              "grid size-6 place-items-center rounded transition",
              view === "list"
                ? "bg-surface-elevated text-foreground"
                : "text-foreground/55 hover:text-foreground/85"
            )}
          >
            <ListIcon />
          </button>
        </div>

        {/* "open in code" — visible when the user has a folder selected
            or when they're inside a folder */}
        <button
          type="button"
          onClick={() => openFolderInCode(cwd)}
          title="open this folder in the code app"
          className="ml-1 flex h-7 items-center gap-1.5 rounded-md border border-border bg-surface-sunken px-2 font-mono text-[10px] text-foreground/65 hover:bg-surface-elevated hover:text-foreground"
        >
          <CodeOpenIcon />
          open in code
        </button>
      </div>

      {/* ── body ────────────────────────────────────────────────────── */}
      <div className="grid min-h-0 grid-cols-[180px_1fr]">
        {/* sidebar shortcuts */}
        <div className="flex min-h-0 flex-col border-r border-border bg-surface-sunken">
          <nav className="space-y-0.5 p-2">
            <SidebarLink
              active={activeTab === "home"}
              onClick={() => onSelectTab("home")}
              icon={<HomeIcon />}
              label="Home"
            />
            <SidebarLink
              active={activeTab === "desktop"}
              onClick={() => onSelectTab("desktop")}
              icon={<DesktopIconSvg />}
              label="Desktop"
            />
            <SidebarLink
              active={activeTab === "documents"}
              onClick={() => onSelectTab("documents")}
              icon={<DocumentsIcon />}
              label="Documents"
            />
            <SidebarLink
              active={activeTab === "downloads"}
              onClick={() => onSelectTab("downloads")}
              icon={<DownloadsIcon />}
              label="Downloads"
            />
            <SidebarLink
              active={activeTab === "projects"}
              onClick={() => onSelectTab("projects")}
              icon={<ProjectsIcon />}
              label="Projects"
            />
            <div className="pt-2 pb-1 pl-2 text-[9px] tracking-widest text-foreground/35 uppercase">
              other
            </div>
            <SidebarLink
              active={false}
              onClick={() => onSelectTab("recent")}
              icon={<ClockIcon />}
              label="Recent"
              dimmed
            />
          </nav>
          <div className="mt-auto border-t border-border px-3 py-2 font-mono text-[10px] text-foreground/40">
            session · {daemon.sessionId ?? "—"}
          </div>
        </div>

        {/* main pane */}
        <div className="flex min-h-0 flex-col">
          <FileBrowser
            state={current}
            entries={visibleEntries}
            view={view}
            selected={selected}
            onSelect={setSelected}
            onOpen={openEntry}
            onEntryContextMenu={(entry, e) => {
              setSelected(entry.name)
              ctx.bind(() => onEntryContext(entry))(e)
            }}
            onEmptyContextMenu={(e) => {
              setSelected(null)
              ctx.bind(() => onEmptyContext)(e)
            }}
          />
        </div>
      </div>
    </div>
  )
}

// ─── breadcrumb ──────────────────────────────────────────────────────────

function Breadcrumb({
  cwd,
  onNavigate,
}: {
  cwd: string
  onNavigate: (path: string) => void
}) {
  const segments = pathSegments(cwd)
  return (
    <div className="flex h-7 flex-1 items-center gap-1 overflow-x-auto rounded-md border border-border bg-surface-sunken px-2 font-mono text-[11px]">
      <button
        type="button"
        onClick={() => onNavigate("")}
        className="flex items-center gap-1 rounded px-1 py-0.5 text-foreground/65 hover:bg-surface-elevated hover:text-foreground"
      >
        <HomeIcon />
        <span>~</span>
      </button>
      {segments.map((seg, i) => {
        const target = segments.slice(0, i + 1).join("/")
        const isLast = i === segments.length - 1
        return (
          <React.Fragment key={target}>
            <span className="text-foreground/30">/</span>
            <button
              type="button"
              onClick={() => onNavigate(target)}
              className={cn(
                "rounded px-1 py-0.5 hover:bg-surface-elevated hover:text-foreground",
                isLast ? "text-foreground" : "text-foreground/65"
              )}
            >
              {seg}
            </button>
          </React.Fragment>
        )
      })}
    </div>
  )
}

// ─── toolbar button ──────────────────────────────────────────────────────

function ToolbarButton({
  children,
  onClick,
  title,
  disabled,
}: {
  children: React.ReactNode
  onClick?: () => void
  title?: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={cn(
        "grid size-7 place-items-center rounded-md transition",
        disabled
          ? "text-foreground/20"
          : "text-foreground/65 hover:bg-surface-elevated hover:text-foreground"
      )}
    >
      {children}
    </button>
  )
}

// ─── sidebar link ────────────────────────────────────────────────────────

function SidebarLink({
  active,
  onClick,
  icon,
  label,
  dimmed,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  dimmed?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] transition",
        active
          ? "bg-surface-elevated text-foreground"
          : "text-foreground/65 hover:bg-surface-elevated hover:text-foreground/90",
        dimmed && "opacity-55"
      )}
    >
      <span
        className={cn(
          "grid size-5 place-items-center text-foreground/65",
          active && "text-primary"
        )}
      >
        {icon}
      </span>
      <span className="flex-1">{label}</span>
    </button>
  )
}

// ─── file browser (grid + list) ──────────────────────────────────────────

function FileBrowser({
  state,
  entries,
  view,
  selected,
  onSelect,
  onOpen,
  onEntryContextMenu,
  onEmptyContextMenu,
}: {
  state: DirState
  entries: DirEntry[]
  view: ViewMode
  selected: string | null
  onSelect: (name: string | null) => void
  onOpen: (entry: DirEntry) => void
  onEntryContextMenu: (entry: DirEntry, e: React.MouseEvent) => void
  onEmptyContextMenu: (e: React.MouseEvent) => void
}) {
  if (state.kind === "loading") {
    return (
      <div
        className="grid h-full place-items-center font-mono text-[11px] text-foreground/40"
        onContextMenu={onEmptyContextMenu}
      >
        loading…
      </div>
    )
  }
  if (state.kind === "error") {
    return (
      <div
        className="grid h-full place-items-center px-6 text-center font-mono text-[11px] text-red-400/80"
        onContextMenu={onEmptyContextMenu}
      >
        {state.message}
      </div>
    )
  }
  if (entries.length === 0) {
    return (
      <div
        className="grid h-full place-items-center font-mono text-[11px] text-foreground/40"
        onContextMenu={onEmptyContextMenu}
      >
        empty folder
      </div>
    )
  }

  if (view === "grid") {
    return (
      <div
        className="grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] content-start gap-2 overflow-y-auto p-4"
        onClick={() => onSelect(null)}
        onContextMenu={onEmptyContextMenu}
      >
        {entries.map((entry) => {
          const lang = languageFromName(entry.name)
          const isSelected = selected === entry.name
          return (
            <button
              key={entry.name}
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onSelect(entry.name)
              }}
              onDoubleClick={() => onOpen(entry)}
              onContextMenu={(e) => {
                e.stopPropagation()
                onEntryContextMenu(entry, e)
              }}
              className={cn(
                "group flex flex-col items-center gap-2 rounded-lg border p-3 transition",
                isSelected
                  ? "border-primary/50 bg-surface-elevated"
                  : "border-transparent hover:border-border hover:bg-surface-elevated"
              )}
            >
              <div className="transition-transform duration-150 group-hover:-translate-y-0.5">
                {entry.type === "dir" ? (
                  <FolderTile size={56} />
                ) : (
                  <FileTile name={entry.name} language={lang} size={48} />
                )}
              </div>
              <div className="line-clamp-2 max-w-full text-center font-mono text-[11px] text-foreground/85">
                {entry.name}
              </div>
            </button>
          )
        })}
      </div>
    )
  }

  // list view
  return (
    <div
      className="overflow-y-auto"
      onClick={() => onSelect(null)}
      onContextMenu={onEmptyContextMenu}
    >
      <table className="w-full border-separate border-spacing-0 font-mono text-[11px]">
        <thead className="sticky top-0 bg-card text-foreground/45">
          <tr>
            <th className="border-b border-border px-4 py-2 text-left text-[10px] tracking-wider font-medium uppercase">
              Name
            </th>
            <th className="border-b border-border px-4 py-2 text-left text-[10px] tracking-wider font-medium uppercase">
              Type
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => {
            const lang = languageFromName(entry.name)
            const isSelected = selected === entry.name
            return (
              <tr
                key={entry.name}
                onClick={(e) => {
                  e.stopPropagation()
                  onSelect(entry.name)
                }}
                onDoubleClick={() => onOpen(entry)}
                onContextMenu={(e) => {
                  e.stopPropagation()
                  onEntryContextMenu(entry, e)
                }}
                className={cn(
                  "cursor-pointer border-b border-border",
                  isSelected
                    ? "bg-surface-elevated"
                    : "hover:bg-surface-elevated"
                )}
              >
                <td className="px-4 py-1.5">
                  <div className="flex items-center gap-2">
                    {entry.type === "dir" ? (
                      <FolderTile size={20} />
                    ) : (
                      <FileTile name={entry.name} language={lang} size={20} />
                    )}
                    <span className="text-foreground">{entry.name}</span>
                  </div>
                </td>
                <td className="px-4 py-1.5 text-foreground/55">
                  {entry.type === "dir" ? "folder" : lang}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
