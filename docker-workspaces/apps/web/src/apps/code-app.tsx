import * as React from "react"

import type { DirEntry } from "@workspace/protocol"
import { cn } from "@workspace/ui/lib/utils"

import { useContextMenu, type ContextMenuItem } from "@/state/context-menu"
import { useDaemon } from "@/state/daemon"
import { useWindows } from "@/state/windows"
import { languageFromName, tokenize } from "@/lib/syntax"

// ─────────────────────────────────────────────────────────────────────────
// code app — mini VS Code
//
// layout:
//   ┌──┬───────────┬─────────────────────────────────────┐
//   │A │ Explorer  │ tab tab tab                         │
//   │c │ ▾ src     │─────────────────────────────────────│
//   │t │   App.ts  │ 1  ┃ const greet = (name: string)…  │
//   │  │ Dockerfile│ 2  ┃   return `hello ${name}`       │
//   │  │ ...       │ ...                                 │
//   ├──┴───────────┴─────────────────────────────────────┤
//   │ ⎇ main  0 ⛔  0 ⚠   Ln 12, Col 4   UTF-8   TypeScript │
//   └─────────────────────────────────────────────────────┘
//
// state lives in two places:
//   • windows.tsx owns codeFolder, codeTabs, codeActiveTab — they
//     survive the window being closed, and let the files app / terminal
//     push files+folders in via openFileInCode / openFolderInCode
//   • this component owns per-tab buffer state (loaded content, draft,
//     dirty flag, save errors). cleared when the tab is closed.
//
// the explorer is **rooted at codeFolder** (a path relative to home).
// without an open folder we render a welcome pane with an "Open Folder"
// button — same as real VS Code. there is no implicit "show me whatever's
// at home root"; the user has to explicitly open a folder, just like a
// real editor would refuse to show your entire `/`.
// ─────────────────────────────────────────────────────────────────────────

type LoadedBuffer = {
  path: string
  language: string
  /** the version on disk — used for the dirty check */
  saved: string
  /** the in-memory edit buffer */
  draft: string
  /** true while the initial readFile is in flight */
  loading: boolean
  /** load failed before content arrived */
  loadError: string | null
  saving: boolean
  saveError: string | null
}

type ActivityView = "explorer" | "search" | "scm" | "run" | "extensions"

// ─── tree state ─────────────────────────────────────────────────────────
// the explorer fetches the root directory on mount and any subdirectory
// on demand when the user expands it. results are cached in `treeCache`
// keyed by directory path.

type DirState =
  | { kind: "loading" }
  | { kind: "ok"; entries: DirEntry[] }
  | { kind: "error"; message: string }

export function CodeApp() {
  const daemon = useDaemon()
  const ctx = useContextMenu()
  const {
    open: openApp,
    codeFolder,
    codeTabs,
    codeActiveTab,
    setCodeActiveTab,
    closeCodeTab,
    openFileInCode,
    openFolderInCode,
    closeCodeFolder,
  } = useWindows()

  const [activityView, setActivityView] = React.useState<ActivityView>(
    "explorer"
  )
  const [sidebarVisible, setSidebarVisible] = React.useState(true)
  const [folderPicker, setFolderPicker] = React.useState(false)

  // Per-path buffer state. Lives in this component (not windows.tsx) so it
  // gets dropped when the window is closed — re-opening reloads from disk.
  const [buffers, setBuffers] = React.useState<Map<string, LoadedBuffer>>(
    () => new Map()
  )

  // tree state cache: each directory path → its contents. paths here are
  // **absolute under home** ("" for home, "projects/greeter-api/src", …)
  // so the cache is shared across folder switches. expanding a node uses
  // the same cache.
  const [treeCache, setTreeCache] = React.useState<Map<string, DirState>>(
    () => new Map()
  )
  const [expanded, setExpanded] = React.useState<Set<string>>(() => new Set())

  // ─── load the code folder when it changes ─────────────────────────────
  React.useEffect(() => {
    if (daemon.connection !== "open") return
    if (codeFolder === null) return
    // mark this folder as the new root and expanded
    setExpanded((current) => {
      if (current.has(codeFolder)) return current
      const next = new Set(current)
      next.add(codeFolder)
      return next
    })
    let cancelled = false
    daemon.listDir(codeFolder || ".").then((res) => {
      if (cancelled) return
      setTreeCache((current) => {
        const next = new Map(current)
        if (res.ok) {
          next.set(codeFolder, { kind: "ok", entries: res.entries })
        } else {
          next.set(codeFolder, { kind: "error", message: res.error })
        }
        return next
      })
    })
    return () => {
      cancelled = true
    }
  }, [daemon.connection, daemon, codeFolder])

  // ─── load any unloaded buffer for an open tab ────────────────────────
  // Simple and bulletproof: for each tab in codeTabs, check the buffer
  // state. If no buffer exists → create placeholder + fetch. If a
  // placeholder exists but is already loading → skip. If it has content
  // or an error → skip. `buffers` IS in the dependency array — the
  // `loading` flag prevents cascading re-fetches.
  React.useEffect(() => {
    if (daemon.connection !== "open") return
    for (const path of codeTabs) {
      const existing = buffers.get(path)
      // already loaded, loading, or errored → skip
      if (existing && (existing.saved !== "" || existing.loading || existing.loadError)) {
        continue
      }

      // create the placeholder with loading=true
      setBuffers((current) => {
        const cur = current.get(path)
        // another render beat us here
        if (cur && (cur.saved !== "" || cur.loading || cur.loadError)) {
          return current
        }
        const next = new Map(current)
        next.set(path, {
          path,
          language: languageFromName(path),
          saved: "",
          draft: "",
          loading: true,
          loadError: null,
          saving: false,
          saveError: null,
        })
        return next
      })

      // fetch the file content from the server
      daemon.readFile(path).then((res) => {
        setBuffers((current) => {
          const next = new Map(current)
          const buf = next.get(path)
          if (!buf) return current
          if (!res.ok) {
            next.set(path, { ...buf, loading: false, loadError: res.error })
          } else {
            next.set(path, {
              ...buf,
              loading: false,
              language: res.language,
              saved: res.content,
              draft: res.content,
            })
          }
          return next
        })
      })
    }
  }, [codeTabs, daemon.connection, daemon, buffers])

  // ─── tree directory loader ────────────────────────────────────────────
  // path is relative to home; "" means home itself.
  const loadDir = React.useCallback(
    async (path: string) => {
      setTreeCache((current) => {
        const next = new Map(current)
        next.set(path, { kind: "loading" })
        return next
      })
      const res = await daemon.listDir(path || ".")
      setTreeCache((current) => {
        const next = new Map(current)
        next.set(
          path,
          res.ok
            ? { kind: "ok", entries: res.entries }
            : { kind: "error", message: res.error }
        )
        return next
      })
    },
    [daemon]
  )

  const toggleDir = React.useCallback(
    (path: string) => {
      setExpanded((current) => {
        const next = new Set(current)
        if (next.has(path)) {
          next.delete(path)
        } else {
          next.add(path)
          // lazy-load if we haven't seen this dir yet
          if (!treeCache.has(path)) {
            void loadDir(path)
          }
        }
        return next
      })
    },
    [loadDir, treeCache]
  )

  // ─── editing helpers ─────────────────────────────────────────────────
  const updateDraft = (path: string, draft: string) => {
    setBuffers((current) => {
      const next = new Map(current)
      const existing = next.get(path)
      if (!existing) return current
      next.set(path, { ...existing, draft, saveError: null })
      return next
    })
  }

  const saveBuffer = React.useCallback(
    async (path: string) => {
      const buf = buffers.get(path)
      if (!buf || buf.saved === buf.draft) return
      setBuffers((current) => {
        const next = new Map(current)
        const existing = next.get(path)
        if (!existing) return current
        next.set(path, { ...existing, saving: true, saveError: null })
        return next
      })
      const res = await daemon.writeFile(path, buf.draft)
      setBuffers((current) => {
        const next = new Map(current)
        const existing = next.get(path)
        if (!existing) return current
        if (res.ok) {
          next.set(path, {
            ...existing,
            saving: false,
            saved: existing.draft,
          })
        } else {
          next.set(path, {
            ...existing,
            saving: false,
            saveError: res.error,
          })
        }
        return next
      })
    },
    [buffers, daemon]
  )

  // global Ctrl+S — save the active buffer
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        if (codeActiveTab) {
          e.preventDefault()
          void saveBuffer(codeActiveTab)
        }
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [codeActiveTab, saveBuffer])

  const activeBuf = codeActiveTab ? buffers.get(codeActiveTab) ?? null : null
  const activeDirty = activeBuf ? activeBuf.draft !== activeBuf.saved : false

  // ─── shared filesystem op runner ────────────────────────────────────
  // tree node actions (delete, new file, new folder) shell out to the
  // daemon's native handlers via the run channel — same path the
  // terminal and files app use, so we get the same containment checks
  // for free.
  const runFsCmd = React.useCallback(
    async (command: string) => {
      await daemon.run(command, "", () => {})
      // refresh any cached dir affected by this op. cheapest correct
      // strategy is "drop the cache for the parent dir(s) we know about
      // and let the lazy loader pull fresh content next time".
      // we just clear and reload the codeFolder root for now.
      if (codeFolder !== null) {
        void loadDir(codeFolder)
      }
    },
    [daemon, codeFolder, loadDir]
  )

  // ─── context menu builders ──────────────────────────────────────────
  const treeNodeMenu = React.useCallback(
    (path: string, kind: "file" | "dir"): ContextMenuItem[] => {
      const name = baseName(path)
      const items: ContextMenuItem[] = [{ kind: "header", label: name }]
      if (kind === "file") {
        items.push({
          label: "Open",
          onClick: () => openFileInCode(path),
        })
      } else {
        items.push({
          label: "Open as Folder",
          onClick: () => openFolderInCode(path),
        })
      }
      items.push({
        label: "Reveal in Files",
        onClick: () => openApp("files"),
      })
      items.push({ kind: "separator" })
      items.push({
        label: "Copy Path",
        onClick: () => {
          void navigator.clipboard?.writeText(path)
        },
      })
      items.push({ kind: "separator" })
      items.push({
        label: "Delete",
        danger: true,
        onClick: () => {
          const confirmed = window.confirm(
            `delete ${kind === "dir" ? "folder" : "file"} "${name}"?` +
              (kind === "dir" ? " this removes everything inside it." : "")
          )
          if (!confirmed) return
          void runFsCmd(
            kind === "dir" ? `rm -rf ${quoteName(path)}` : `rm ${quoteName(path)}`
          )
          // also drop any open tab pointing at it (or anything under it
          // if it was a directory)
          for (const tab of codeTabs) {
            if (
              tab === path ||
              (kind === "dir" && tab.startsWith(`${path}/`))
            ) {
              closeCodeTab(tab)
            }
          }
        },
      })
      return items
    },
    [
      openFileInCode,
      openFolderInCode,
      openApp,
      runFsCmd,
      codeTabs,
      closeCodeTab,
    ]
  )

  const tabMenu = React.useCallback(
    (tabPath: string): ContextMenuItem[] => {
      return [
        { kind: "header", label: baseName(tabPath) },
        { label: "Close", onClick: () => closeCodeTab(tabPath) },
        {
          label: "Close Others",
          disabled: codeTabs.length <= 1,
          onClick: () => {
            for (const t of codeTabs) {
              if (t !== tabPath) closeCodeTab(t)
            }
          },
        },
        {
          label: "Close All",
          onClick: () => {
            for (const t of [...codeTabs]) closeCodeTab(t)
          },
        },
        { kind: "separator" },
        {
          label: "Copy Path",
          onClick: () => {
            void navigator.clipboard?.writeText(tabPath)
          },
        },
      ]
    },
    [codeTabs, closeCodeTab]
  )

  return (
    <div className="grid min-h-0 flex-1 grid-rows-[auto_1fr_auto] bg-card text-foreground">
      {/* ── menu bar ─────────────────────────────────────────────────── */}
      <MenuBar
        hasFolder={codeFolder !== null}
        onOpenFolder={() => setFolderPicker(true)}
        onCloseFolder={closeCodeFolder}
      />

      <div className="grid min-h-0 grid-cols-[44px_auto_1fr]">
        {/* activity bar */}
        <ActivityBar
          view={activityView}
          onView={(v) => {
            // toggle the sidebar if you click the active view
            if (activityView === v) {
              setSidebarVisible((s) => !s)
            } else {
              setActivityView(v)
              setSidebarVisible(true)
            }
          }}
        />

        {/* sidebar (file explorer / search / etc) */}
        {sidebarVisible ? (
          <div className="flex min-h-0 w-60 flex-col border-r border-border bg-surface-sunken">
            <SidebarHeader title={activityView} />
            <div className="min-h-0 flex-1 overflow-y-auto py-1">
              {activityView === "explorer" && codeFolder !== null && (
                <ExplorerTree
                  rootPath={codeFolder}
                  treeCache={treeCache}
                  expanded={expanded}
                  toggleDir={toggleDir}
                  activePath={codeActiveTab}
                  onOpenFile={openFileInCode}
                  onNodeContextMenu={(path, kind, e) =>
                    ctx.bind(() => treeNodeMenu(path, kind))(e)
                  }
                />
              )}
              {activityView === "explorer" && codeFolder === null && (
                <ExplorerEmpty onOpen={() => setFolderPicker(true)} />
              )}
              {activityView === "search" && <SearchStub />}
              {activityView === "scm" && <SCMStub />}
              {activityView === "run" && <RunStub />}
              {activityView === "extensions" && <ExtensionsStub />}
            </div>
            {activityView === "explorer" && codeTabs.length > 0 && (
              <OpenEditorsList
                tabs={codeTabs}
                buffers={buffers}
                active={codeActiveTab}
                onActivate={setCodeActiveTab}
                onClose={closeCodeTab}
              />
            )}
          </div>
        ) : (
          <div />
        )}

        {/* editor area */}
        <div className="flex min-h-0 flex-col">
          <TabBar
            tabs={codeTabs}
            buffers={buffers}
            active={codeActiveTab}
            onActivate={setCodeActiveTab}
            onClose={closeCodeTab}
            onTabContextMenu={(path, e) =>
              ctx.bind(() => tabMenu(path))(e)
            }
          />
          {activeBuf && activeBuf.loading ? (
            <div className="grid min-h-0 flex-1 place-items-center bg-card font-mono text-[12px] text-foreground/40">
              loading {baseName(activeBuf.path)}…
            </div>
          ) : activeBuf ? (
            <Editor
              buffer={activeBuf}
              dirty={activeDirty}
              onChange={(v) => updateDraft(activeBuf.path, v)}
            />
          ) : codeFolder === null ? (
            <WelcomePaneEmpty onOpen={() => setFolderPicker(true)} />
          ) : (
            <WelcomePaneFolder folder={codeFolder} />
          )}
        </div>
      </div>

      {/* status bar */}
      <StatusBar
        connection={daemon.connection}
        sessionId={daemon.sessionId}
        folder={codeFolder}
        active={activeBuf}
        dirty={activeDirty}
      />

      {/* open-folder picker modal */}
      {folderPicker && (
        <FolderPicker
          onClose={() => setFolderPicker(false)}
          onPick={(path) => {
            setFolderPicker(false)
            openFolderInCode(path)
          }}
        />
      )}
    </div>
  )
}

// ─── menu bar ───────────────────────────────────────────────────────────

function MenuBar({
  hasFolder,
  onOpenFolder,
  onCloseFolder,
}: {
  hasFolder: boolean
  onOpenFolder: () => void
  onCloseFolder: () => void
}) {
  const [openMenu, setOpenMenu] = React.useState<string | null>(null)
  const items = ["File", "Edit", "Selection", "View", "Go", "Run", "Help"]

  // close any open menu when clicking outside
  React.useEffect(() => {
    if (!openMenu) return
    const onDoc = () => setOpenMenu(null)
    window.addEventListener("mousedown", onDoc)
    return () => window.removeEventListener("mousedown", onDoc)
  }, [openMenu])

  return (
    <div className="relative flex h-7 shrink-0 items-center gap-0.5 border-b border-border bg-surface-sunken px-2 font-mono text-[11px] text-foreground/70">
      <CodeMark />
      {items.map((item) => (
        <button
          key={item}
          type="button"
          onMouseDown={(e) => {
            e.stopPropagation()
            setOpenMenu(openMenu === item ? null : item)
          }}
          className={cn(
            "rounded px-2 py-0.5 hover:bg-surface-elevated hover:text-foreground",
            openMenu === item && "bg-surface-elevated text-foreground"
          )}
        >
          {item}
        </button>
      ))}
      {openMenu === "File" && (
        <div
          className="absolute top-7 left-7 z-50 min-w-[180px] rounded-md border border-border bg-popover py-1 text-popover-foreground shadow-lg"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <MenuItem
            label="Open Folder…"
            shortcut="⌃K ⌃O"
            onClick={() => {
              setOpenMenu(null)
              onOpenFolder()
            }}
          />
          <MenuItem
            label="Close Folder"
            disabled={!hasFolder}
            onClick={() => {
              setOpenMenu(null)
              onCloseFolder()
            }}
          />
        </div>
      )}
    </div>
  )
}

function MenuItem({
  label,
  shortcut,
  disabled,
  onClick,
}: {
  label: string
  shortcut?: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex w-full items-center justify-between px-3 py-1 text-left text-[11px]",
        disabled
          ? "text-foreground/30"
          : "hover:bg-surface-elevated hover:text-foreground"
      )}
    >
      <span>{label}</span>
      {shortcut && <span className="text-foreground/35">{shortcut}</span>}
    </button>
  )
}

function CodeMark() {
  return (
    <div className="mr-1 grid size-5 place-items-center text-blue-400">
      <svg viewBox="0 0 24 24" fill="currentColor" className="size-4">
        <path d="M17.5 2.5 21 5v14l-3.5 2.5L8 12.8V19l-3.5 1.5L2 19V5l2.5-1.5L8 5v6.2L17.5 2.5ZM5 7.5v9l2 .8v-10L5 7.5Zm13 1.3-6 4 6 4V8.8Z" />
      </svg>
    </div>
  )
}

// ─── activity bar ───────────────────────────────────────────────────────

function ActivityBar({
  view,
  onView,
}: {
  view: ActivityView
  onView: (v: ActivityView) => void
}) {
  const items: Array<{ id: ActivityView; icon: React.ReactNode; label: string }> =
    [
      { id: "explorer", icon: <FilesIcon />, label: "Explorer" },
      { id: "search", icon: <SearchIcon />, label: "Search" },
      { id: "scm", icon: <BranchIcon />, label: "Source Control" },
      { id: "run", icon: <PlayDebugIcon />, label: "Run and Debug" },
      { id: "extensions", icon: <ExtensionsIcon />, label: "Extensions" },
    ]
  return (
    <div className="flex flex-col items-center justify-between border-r border-border bg-surface-sunken py-1.5">
      <div className="flex flex-col items-center gap-0.5">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onView(item.id)}
            title={item.label}
            className={cn(
              "relative grid size-9 place-items-center text-foreground/55 transition hover:text-foreground",
              view === item.id && "text-foreground"
            )}
          >
            {view === item.id && (
              <span className="absolute top-1 bottom-1 left-0 w-[2px] rounded-r bg-blue-400" />
            )}
            {item.icon}
          </button>
        ))}
      </div>
      <div className="flex flex-col items-center gap-0.5">
        <button
          type="button"
          title="Accounts"
          className="grid size-9 place-items-center text-foreground/55 hover:text-foreground"
        >
          <UserIcon />
        </button>
        <button
          type="button"
          title="Settings"
          className="grid size-9 place-items-center text-foreground/55 hover:text-foreground"
        >
          <GearIcon />
        </button>
      </div>
    </div>
  )
}

// ─── sidebar header ─────────────────────────────────────────────────────

function SidebarHeader({ title }: { title: ActivityView }) {
  const labels: Record<ActivityView, string> = {
    explorer: "EXPLORER",
    search: "SEARCH",
    scm: "SOURCE CONTROL",
    run: "RUN AND DEBUG",
    extensions: "EXTENSIONS",
  }
  return (
    <div className="flex h-8 shrink-0 items-center justify-between border-b border-border px-3 font-mono text-[10px] tracking-widest text-foreground/55 uppercase">
      <span>{labels[title]}</span>
      <button
        type="button"
        className="grid size-5 place-items-center rounded text-foreground/55 hover:bg-surface-elevated hover:text-foreground"
        title="more actions"
      >
        <DotsIcon />
      </button>
    </div>
  )
}

// ─── explorer tree ──────────────────────────────────────────────────────
//
// rooted at codeFolder. paths in the cache are absolute under home, so a
// child of "projects/greeter-api" with name "src" becomes
// "projects/greeter-api/src". the root "" (home) is also legal.

function ExplorerTree({
  rootPath,
  treeCache,
  expanded,
  toggleDir,
  activePath,
  onOpenFile,
  onNodeContextMenu,
}: {
  rootPath: string
  treeCache: Map<string, DirState>
  expanded: Set<string>
  toggleDir: (path: string) => void
  activePath: string | null
  onOpenFile: (path: string) => void
  onNodeContextMenu: (
    path: string,
    kind: "file" | "dir",
    e: React.MouseEvent
  ) => void
}) {
  // the visible name in the explorer header is the basename of the
  // folder; for the home root we just show "~".
  const rootName = rootPath === "" ? "~" : baseName(rootPath)
  return (
    <div
      className="font-mono text-[12px] text-foreground/85"
      onContextMenu={(e) => {
        // right-click on the explorer header / blank space → treat as
        // the root folder so the user can still get "Delete" / "Reveal"
        e.stopPropagation()
        onNodeContextMenu(rootPath, "dir", e)
      }}
    >
      <div className="flex h-6 items-center gap-1 px-2 text-foreground/65">
        <ChevronDown />
        <span className="truncate font-semibold tracking-wide text-foreground/85 uppercase">
          {rootName}
        </span>
      </div>
      <DirNode
        path={rootPath}
        depth={0}
        treeCache={treeCache}
        expanded={expanded}
        toggleDir={toggleDir}
        activePath={activePath}
        onOpenFile={onOpenFile}
        onNodeContextMenu={onNodeContextMenu}
      />
    </div>
  )
}

function DirNode({
  path,
  depth,
  treeCache,
  expanded,
  toggleDir,
  activePath,
  onOpenFile,
  onNodeContextMenu,
}: {
  path: string
  depth: number
  treeCache: Map<string, DirState>
  expanded: Set<string>
  toggleDir: (path: string) => void
  activePath: string | null
  onOpenFile: (path: string) => void
  onNodeContextMenu: (
    path: string,
    kind: "file" | "dir",
    e: React.MouseEvent
  ) => void
}) {
  const state = treeCache.get(path)
  if (!state) return null
  if (state.kind === "loading") {
    return (
      <div
        className="px-2 py-0.5 text-[11px] text-foreground/40 italic"
        style={{ paddingLeft: 16 + depth * 14 }}
      >
        loading…
      </div>
    )
  }
  if (state.kind === "error") {
    return (
      <div
        className="px-2 py-0.5 text-[11px] text-red-400/80"
        style={{ paddingLeft: 16 + depth * 14 }}
      >
        {state.message}
      </div>
    )
  }
  return (
    <div>
      {state.entries.map((entry) => {
        // join path with the entry name; "" + name = name
        const childPath = path ? `${path}/${entry.name}` : entry.name
        if (entry.type === "dir") {
          const isOpen = expanded.has(childPath)
          return (
            <React.Fragment key={childPath}>
              <button
                type="button"
                onClick={() => toggleDir(childPath)}
                onContextMenu={(e) => {
                  e.stopPropagation()
                  onNodeContextMenu(childPath, "dir", e)
                }}
                className="flex w-full items-center gap-1 px-2 py-0.5 text-left hover:bg-surface-elevated"
                style={{ paddingLeft: 8 + depth * 14 }}
              >
                <span className="grid size-3 place-items-center text-foreground/55">
                  {isOpen ? <ChevronDown /> : <ChevronRight />}
                </span>
                <FolderTreeIcon open={isOpen} />
                <span className="truncate text-foreground/85">{entry.name}</span>
              </button>
              {isOpen && (
                <DirNode
                  path={childPath}
                  depth={depth + 1}
                  treeCache={treeCache}
                  expanded={expanded}
                  toggleDir={toggleDir}
                  activePath={activePath}
                  onOpenFile={onOpenFile}
                  onNodeContextMenu={onNodeContextMenu}
                />
              )}
            </React.Fragment>
          )
        }
        const isActive = childPath === activePath
        return (
          <button
            key={childPath}
            type="button"
            onClick={() => onOpenFile(childPath)}
            onContextMenu={(e) => {
              e.stopPropagation()
              onNodeContextMenu(childPath, "file", e)
            }}
            className={cn(
              "flex w-full items-center gap-1 px-2 py-0.5 text-left hover:bg-surface-elevated",
              isActive && "bg-surface-elevated text-foreground"
            )}
            style={{ paddingLeft: 8 + depth * 14 + 14 }}
          >
            <FileTreeIcon name={entry.name} />
            <span className="truncate text-foreground/85">{entry.name}</span>
          </button>
        )
      })}
    </div>
  )
}

// ─── empty explorer / "no folder open" state ──────────────────────────

function ExplorerEmpty({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="px-3 py-3">
      <div className="font-mono text-[10px] text-foreground/55">
        you have not yet opened a folder.
      </div>
      <button
        type="button"
        onClick={onOpen}
        className="mt-2 w-full rounded bg-blue-600 py-1 text-[11px] font-medium text-white hover:bg-blue-500"
      >
        Open Folder
      </button>
    </div>
  )
}

// ─── open editors strip (collapsed list above the tree) ─────────────────

function OpenEditorsList({
  tabs,
  buffers,
  active,
  onActivate,
  onClose,
}: {
  tabs: string[]
  buffers: Map<string, LoadedBuffer>
  active: string | null
  onActivate: (p: string) => void
  onClose: (p: string) => void
}) {
  return (
    <div className="border-t border-border">
      <div className="flex h-6 items-center gap-1 px-2 font-mono text-[10px] tracking-widest text-foreground/55 uppercase">
        <ChevronDown />
        <span>open editors</span>
      </div>
      <div className="max-h-32 overflow-y-auto pb-1">
        {tabs.map((path) => {
          const buf = buffers.get(path)
          const dirty = buf ? buf.draft !== buf.saved : false
          const isActive = path === active
          return (
            <div
              key={path}
              className={cn(
                "group flex h-6 items-center gap-1 px-2 font-mono text-[11px] hover:bg-surface-elevated",
                isActive && "bg-surface-elevated"
              )}
            >
              <FileTreeIcon name={baseName(path)} />
              <button
                type="button"
                onClick={() => onActivate(path)}
                className="flex-1 truncate text-left text-foreground/85"
                title={path}
              >
                {baseName(path)}
              </button>
              {dirty && <span className="size-1.5 rounded-full bg-foreground/55" />}
              <button
                type="button"
                onClick={() => onClose(path)}
                className="grid size-4 place-items-center rounded text-foreground/45 opacity-0 group-hover:opacity-100 hover:bg-surface-elevated hover:text-foreground"
                title="close"
              >
                ×
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── tab bar ────────────────────────────────────────────────────────────

function TabBar({
  tabs,
  buffers,
  active,
  onActivate,
  onClose,
  onTabContextMenu,
}: {
  tabs: string[]
  buffers: Map<string, LoadedBuffer>
  active: string | null
  onActivate: (p: string) => void
  onClose: (p: string) => void
  onTabContextMenu: (path: string, e: React.MouseEvent) => void
}) {
  return (
    <div className="flex h-9 shrink-0 items-end gap-px overflow-x-auto border-b border-border bg-surface-sunken">
      {tabs.length === 0 && (
        <div className="flex h-full items-center px-3 font-mono text-[11px] text-foreground/35">
          no open editors
        </div>
      )}
      {tabs.map((path) => {
        const buf = buffers.get(path)
        const dirty = buf ? buf.draft !== buf.saved : false
        const isActive = path === active
        return (
          <div
            key={path}
            onContextMenu={(e) => {
              e.stopPropagation()
              onTabContextMenu(path, e)
            }}
            className={cn(
              "group relative flex h-full shrink-0 items-center gap-2 border-r border-border px-3 font-mono text-[11px]",
              isActive
                ? "bg-card text-foreground"
                : "bg-surface-sunken text-foreground/55 hover:text-foreground/85"
            )}
          >
            {isActive && (
              <span className="absolute top-0 right-0 left-0 h-px bg-blue-400" />
            )}
            <FileTreeIcon name={baseName(path)} />
            <button
              type="button"
              onClick={() => onActivate(path)}
              className="text-left"
              title={path}
            >
              {baseName(path)}
            </button>
            <button
              type="button"
              onClick={() => onClose(path)}
              className="grid size-4 place-items-center rounded text-foreground/45 hover:bg-surface-elevated hover:text-foreground"
              title="close"
            >
              {dirty ? (
                <span className="size-1.5 rounded-full bg-foreground/65 group-hover:hidden" />
              ) : null}
              <span className={cn(dirty && "hidden group-hover:inline")}>×</span>
              {!dirty && <span>×</span>}
            </button>
          </div>
        )
      })}
    </div>
  )
}

// ─── editor (the actual code area) ──────────────────────────────────────
//
// the editor uses the standard "transparent textarea on top of a tokenized
// pre" trick: the pre paints colored tokens, the textarea handles input
// with a fully transparent text color but a visible caret. their scroll
// positions are kept in sync by an onScroll handler.
//
// fixed line-height + monospace font = the two layers stay aligned.

const EDITOR_FONT =
  "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace"
const EDITOR_LINE_HEIGHT_PX = 20
const EDITOR_FONT_SIZE_PX = 13
const EDITOR_PAD_X = 12
const EDITOR_PAD_Y = 8
const GUTTER_WIDTH = 56

function Editor({
  buffer,
  dirty,
  onChange,
}: {
  buffer: LoadedBuffer
  dirty: boolean
  onChange: (v: string) => void
}) {
  const taRef = React.useRef<HTMLTextAreaElement | null>(null)
  const preRef = React.useRef<HTMLPreElement | null>(null)
  const gutterRef = React.useRef<HTMLDivElement | null>(null)

  const lines = React.useMemo(
    () => tokenize(buffer.draft, buffer.language),
    [buffer.draft, buffer.language]
  )

  // sync the highlight overlay + the gutter to the textarea's scroll
  const onScroll = React.useCallback(() => {
    const ta = taRef.current
    if (!ta) return
    if (preRef.current) {
      preRef.current.scrollTop = ta.scrollTop
      preRef.current.scrollLeft = ta.scrollLeft
    }
    if (gutterRef.current) {
      gutterRef.current.scrollTop = ta.scrollTop
    }
  }, [])

  if (buffer.loadError) {
    return (
      <div className="grid min-h-0 flex-1 place-items-center bg-card font-mono text-[12px] text-red-400/80">
        {buffer.loadError}
      </div>
    )
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-card">
      {/* error toast at the top of the editor area when save fails */}
      {buffer.saveError && (
        <div className="border-b border-red-400/30 bg-red-400/10 px-4 py-1.5 font-mono text-[11px] text-red-400/85">
          save failed: {buffer.saveError}
        </div>
      )}
      <div className="relative flex min-h-0 flex-1">
        {/* gutter */}
        <div
          ref={gutterRef}
          className="shrink-0 select-none overflow-hidden bg-card text-right text-foreground/30"
          style={{
            width: GUTTER_WIDTH,
            fontFamily: EDITOR_FONT,
            fontSize: EDITOR_FONT_SIZE_PX,
            lineHeight: `${EDITOR_LINE_HEIGHT_PX}px`,
            paddingTop: EDITOR_PAD_Y,
            paddingBottom: EDITOR_PAD_Y,
            paddingRight: 12,
          }}
        >
          {lines.map((_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>

        {/* code area: pre (highlighting) + textarea (input) overlay */}
        <div className="relative min-h-0 flex-1">
          <pre
            ref={preRef}
            aria-hidden
            className="absolute inset-0 m-0 overflow-auto whitespace-pre"
            style={{
              fontFamily: EDITOR_FONT,
              fontSize: EDITOR_FONT_SIZE_PX,
              lineHeight: `${EDITOR_LINE_HEIGHT_PX}px`,
              padding: `${EDITOR_PAD_Y}px ${EDITOR_PAD_X}px`,
              tabSize: 2,
              color: "var(--foreground)",
            }}
          >
            {lines.map((tokens, i) => (
              <div key={i}>
                {tokens.map((t, j) =>
                  t.cls ? (
                    <span key={j} className={t.cls}>
                      {t.text}
                    </span>
                  ) : (
                    <span key={j}>{t.text}</span>
                  )
                )}
                {tokens.length === 1 && tokens[0].text === "" ? "\u200B" : ""}
              </div>
            ))}
          </pre>
          <textarea
            ref={taRef}
            value={buffer.draft}
            onChange={(e) => onChange(e.target.value)}
            onScroll={onScroll}
            spellCheck={false}
            className="absolute inset-0 m-0 resize-none overflow-auto whitespace-pre border-0 bg-transparent text-transparent caret-foreground outline-none"
            style={{
              fontFamily: EDITOR_FONT,
              fontSize: EDITOR_FONT_SIZE_PX,
              lineHeight: `${EDITOR_LINE_HEIGHT_PX}px`,
              padding: `${EDITOR_PAD_Y}px ${EDITOR_PAD_X}px`,
              tabSize: 2,
            }}
          />
        </div>
      </div>
      {/* breadcrumb / dirty marker */}
      {dirty && (
        <div className="pointer-events-none absolute right-3 bottom-3 rounded-md border border-border bg-surface-elevated px-2 py-1 font-mono text-[10px] text-foreground/65 shadow">
          unsaved · ⌃S to save
        </div>
      )}
    </div>
  )
}

// ─── welcome pane (no folder open) ─────────────────────────────────────

function WelcomePaneEmpty({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="grid min-h-0 flex-1 place-items-center bg-card">
      <div className="max-w-md text-center">
        <div className="font-display text-3xl text-foreground/50">code</div>
        <div className="mt-1 font-mono text-[11px] text-foreground/35">
          editing files in your dockerlab workspace
        </div>
        <div className="mt-6 flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={onOpen}
            className="rounded bg-blue-600 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-blue-500"
          >
            Open Folder
          </button>
          <div className="font-mono text-[10px] text-foreground/35">
            or use <span className="text-foreground/65">code .</span> in the terminal
          </div>
        </div>
        <div className="mt-8 grid grid-cols-2 gap-2 font-mono text-[10px] text-foreground/45">
          <Shortcut keys="Ctrl S">save current file</Shortcut>
          <Shortcut keys="click">open file from explorer</Shortcut>
        </div>
      </div>
    </div>
  )
}

function WelcomePaneFolder({ folder }: { folder: string }) {
  return (
    <div className="grid min-h-0 flex-1 place-items-center bg-card">
      <div className="max-w-md text-center">
        <div className="font-display text-3xl text-foreground/50">code</div>
        <div className="mt-1 font-mono text-[11px] text-foreground/35">
          {folder ? `~/${folder}` : "~"}
        </div>
        <div className="mt-6 font-mono text-[11px] text-foreground/65">
          pick a file from the explorer to start editing →
        </div>
      </div>
    </div>
  )
}

function Shortcut({ keys, children }: { keys: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded border border-border bg-surface-sunken px-2 py-1">
      <span className="rounded border border-border bg-surface-elevated px-1.5 py-0.5 text-foreground/65">
        {keys}
      </span>
      <span className="flex-1 text-left">{children}</span>
    </div>
  )
}

// ─── folder picker modal ─────────────────────────────────────────────
//
// VS Code's "Open Folder" pops a native dialog. we don't have one, so
// we render a tiny modal file picker that walks the home filesystem.
// the user clicks through to a folder and hits "Open" — same UX as a
// real file dialog, just a lot uglier.

function FolderPicker({
  onClose,
  onPick,
}: {
  onClose: () => void
  onPick: (path: string) => void
}) {
  const daemon = useDaemon()
  const [cwd, setCwd] = React.useState<string>("")
  const [entries, setEntries] = React.useState<DirEntry[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    setEntries(null)
    setError(null)
    daemon.listDir(cwd || ".").then((res) => {
      if (cancelled) return
      if (!res.ok) {
        setError(res.error)
        return
      }
      // only show directories — this is a *folder* picker
      setEntries(res.entries.filter((e) => e.type === "dir"))
    })
    return () => {
      cancelled = true
    }
  }, [cwd, daemon])

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-black/55"
      onMouseDown={onClose}
    >
      <div
        className="flex max-h-[70vh] w-[440px] flex-col rounded-lg border border-border bg-card shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border px-4 py-3 font-display text-[13px] text-foreground">
          Open Folder
        </div>
        <div className="border-b border-border px-4 py-2 font-mono text-[11px] text-foreground/65">
          {cwd ? `~/${cwd}` : "~"}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto py-1 font-mono text-[12px]">
          {cwd && (
            <button
              type="button"
              onClick={() => setCwd(parentOf(cwd))}
              className="flex w-full items-center gap-2 px-4 py-1 text-left text-foreground/65 hover:bg-surface-elevated"
            >
              <span className="text-foreground/35">..</span>
              <span>parent directory</span>
            </button>
          )}
          {error && (
            <div className="px-4 py-2 text-red-400/80">{error}</div>
          )}
          {entries === null && !error && (
            <div className="px-4 py-2 text-foreground/40">loading…</div>
          )}
          {entries?.map((entry) => (
            <button
              key={entry.name}
              type="button"
              onDoubleClick={() => onPick(joinPath(cwd, entry.name))}
              onClick={() => setCwd(joinPath(cwd, entry.name))}
              className="flex w-full items-center gap-2 px-4 py-1 text-left text-foreground/85 hover:bg-surface-elevated"
            >
              <FolderTreeIcon open={false} />
              <span className="truncate">{entry.name}</span>
            </button>
          ))}
          {entries?.length === 0 && !error && (
            <div className="px-4 py-2 text-foreground/40">no subfolders</div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-border px-3 py-1 text-[11px] text-foreground/65 hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onPick(cwd)}
            className="rounded bg-blue-600 px-3 py-1 text-[11px] font-medium text-white hover:bg-blue-500"
          >
            Open
          </button>
        </div>
      </div>
    </div>
  )
}

function joinPath(parent: string, child: string): string {
  return parent ? `${parent}/${child}` : child
}

function parentOf(path: string): string {
  const idx = path.lastIndexOf("/")
  return idx >= 0 ? path.slice(0, idx) : ""
}

/**
 * Wrap an absolute-under-home path in double quotes if it has spaces.
 * Used by the tree node delete handler when calling `rm` via the
 * native command channel — same convention as the files app.
 */
function quoteName(path: string): string {
  return path.includes(" ") ? `"${path}"` : path
}

// ─── status bar ─────────────────────────────────────────────────────────

function StatusBar({
  connection,
  sessionId,
  folder,
  active,
  dirty,
}: {
  connection: string
  sessionId: string | null
  folder: string | null
  active: LoadedBuffer | null
  dirty: boolean
}) {
  const { line, col } = active ? caretPosition(active.draft) : { line: 1, col: 1 }
  return (
    <div className="flex h-6 shrink-0 items-center gap-3 border-t border-border bg-blue-600/90 px-2 font-mono text-[10px] text-white/95">
      <span className="flex items-center gap-1">
        <BranchTinyIcon />
        main
      </span>
      <span className="flex items-center gap-1">
        <ErrorTinyIcon />0
      </span>
      <span className="flex items-center gap-1">
        <WarnTinyIcon />0
      </span>
      <span className="flex items-center gap-1">
        <span
          className={cn(
            "size-1.5 rounded-full",
            connection === "open" ? "bg-emerald-300" : "bg-red-300"
          )}
        />
        {connection === "open" ? "daemon online" : connection}
      </span>
      {sessionId && <span className="text-white/65">session {sessionId}</span>}
      {folder !== null && (
        <span className="text-white/65">{folder ? `~/${folder}` : "~"}</span>
      )}

      <div className="ml-auto flex items-center gap-3">
        {active && (
          <>
            <span>
              Ln {line}, Col {col}
            </span>
            <span>Spaces: 2</span>
            <span>UTF-8</span>
            <span>LF</span>
            <span className="capitalize">{active.language}</span>
            {dirty && (
              <span className="rounded bg-white/15 px-1.5">unsaved</span>
            )}
          </>
        )}
        {!active && folder === null && (
          <span className="text-white/65">no folder open</span>
        )}
        {!active && folder !== null && (
          <span className="text-white/65">no file open</span>
        )}
      </div>
    </div>
  )
}

// rough caret position helper — without a real cursor we just report the
// final line. since we don't track selection in state, this is a "best
// effort" status bar field, not a precise cursor location.
function caretPosition(text: string): { line: number; col: number } {
  const lines = text.split("\n")
  return { line: lines.length, col: (lines[lines.length - 1]?.length ?? 0) + 1 }
}

// ─── stub side panels (search / scm / run / extensions) ─────────────────

function SearchStub() {
  return (
    <StubBlock
      icon={<SearchIcon />}
      title="Search"
      body="Project-wide search isn't wired up in dockerlab. Use Ctrl+F inside a file."
    />
  )
}
function SCMStub() {
  return (
    <StubBlock
      icon={<BranchIcon />}
      title="Source Control"
      body="No git integration in this demo. Files are saved straight to your workspace on disk."
    />
  )
}
function RunStub() {
  return (
    <StubBlock
      icon={<PlayDebugIcon />}
      title="Run and Debug"
      body="Use the terminal app to run docker build / docker run."
    />
  )
}
function ExtensionsStub() {
  return (
    <StubBlock
      icon={<ExtensionsIcon />}
      title="Extensions"
      body="Out of scope for the demo."
    />
  )
}
function StubBlock({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode
  title: string
  body: string
}) {
  return (
    <div className="grid place-items-center px-4 py-8 text-center">
      <div className="grid size-10 place-items-center rounded-md border border-border bg-surface-elevated text-foreground/45">
        {icon}
      </div>
      <div className="mt-3 font-display text-[12px] text-foreground/85">
        {title}
      </div>
      <div className="mt-1 font-mono text-[10px] text-foreground/45">{body}</div>
    </div>
  )
}

// ─── small helpers ──────────────────────────────────────────────────────

function baseName(path: string): string {
  const idx = path.lastIndexOf("/")
  return idx >= 0 ? path.slice(idx + 1) : path
}

// ─── icons ──────────────────────────────────────────────────────────────

const ICON_PROPS = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
}

function FilesIcon() {
  return (
    <svg {...ICON_PROPS} className="size-5">
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Z" />
      <path d="M14 3v6h6" />
    </svg>
  )
}
function SearchIcon() {
  return (
    <svg {...ICON_PROPS} className="size-5">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  )
}
function BranchIcon() {
  return (
    <svg {...ICON_PROPS} className="size-5">
      <circle cx="6" cy="6" r="2" />
      <circle cx="18" cy="6" r="2" />
      <circle cx="12" cy="18" r="2" />
      <path d="M6 8v4a4 4 0 0 0 4 4h2M18 8v2a4 4 0 0 1-4 4h-2" />
    </svg>
  )
}
function PlayDebugIcon() {
  return (
    <svg {...ICON_PROPS} className="size-5">
      <circle cx="12" cy="12" r="9" />
      <path d="m10 8 6 4-6 4V8Z" fill="currentColor" stroke="none" />
    </svg>
  )
}
function ExtensionsIcon() {
  return (
    <svg {...ICON_PROPS} className="size-5">
      <path d="M3 5a2 2 0 0 1 2-2h4v4h6V3h4a2 2 0 0 1 2 2v4h-4v6h4v4a2 2 0 0 1-2 2h-4v-4H9v4H5a2 2 0 0 1-2-2v-4h4V9H3V5Z" />
    </svg>
  )
}
function UserIcon() {
  return (
    <svg {...ICON_PROPS} className="size-5">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  )
}
function GearIcon() {
  return (
    <svg {...ICON_PROPS} className="size-5">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </svg>
  )
}
function DotsIcon() {
  return (
    <svg {...ICON_PROPS} className="size-3.5">
      <circle cx="5" cy="12" r="1" fill="currentColor" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
      <circle cx="19" cy="12" r="1" fill="currentColor" />
    </svg>
  )
}
function ChevronDown() {
  return (
    <svg {...ICON_PROPS} className="size-3">
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}
function ChevronRight() {
  return (
    <svg {...ICON_PROPS} className="size-3">
      <path d="m9 6 6 6-6 6" />
    </svg>
  )
}
function FolderTreeIcon({ open }: { open: boolean }) {
  // VS Code-like blue folder. open vs closed gets a slightly different lid.
  return (
    <svg viewBox="0 0 24 24" className="size-4 shrink-0" fill="none">
      {open ? (
        <path
          d="M3 7a1 1 0 0 1 1-1h4l2 2h9a1 1 0 0 1 1 1v1H4l-1 9V7Zm1 10 1.5-7h17l-1.5 7H4Z"
          fill="oklch(0.65 0.15 235)"
          stroke="oklch(0.45 0.15 235)"
          strokeWidth="0.5"
        />
      ) : (
        <path
          d="M3 7a1 1 0 0 1 1-1h4l2 2h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7Z"
          fill="oklch(0.6 0.16 235)"
          stroke="oklch(0.42 0.15 235)"
          strokeWidth="0.5"
        />
      )}
    </svg>
  )
}
function FileTreeIcon({ name }: { name: string }) {
  // VS Code-like file glyph; per-language tint.
  const lang = languageFromName(name)
  const lower = name.toLowerCase()
  let color = "oklch(0.7 0.02 240)"
  if (lower === "dockerfile" || lang === "dockerfile") color = "oklch(0.6 0.18 240)"
  else if (lang === "typescript") color = "oklch(0.6 0.18 240)"
  else if (lang === "javascript") color = "oklch(0.78 0.16 90)"
  else if (lang === "json") color = "oklch(0.7 0.05 80)"
  else if (lang === "yaml") color = "oklch(0.65 0.18 25)"
  else if (lang === "markdown") color = "oklch(0.65 0.13 200)"
  else if (lang === "ini") color = "oklch(0.6 0.04 60)"
  return (
    <svg viewBox="0 0 24 24" className="size-4 shrink-0" fill="none">
      <path
        d="M6 3h8l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"
        fill={color}
        opacity="0.85"
        stroke="oklch(0 0 0 / 0.25)"
        strokeWidth="0.5"
      />
      <path
        d="M14 3v4h4"
        fill="none"
        stroke="oklch(1 0 0 / 0.5)"
        strokeWidth="0.8"
      />
    </svg>
  )
}
function BranchTinyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-3">
      <circle cx="6" cy="6" r="2" />
      <circle cx="18" cy="6" r="2" />
      <circle cx="12" cy="18" r="2" />
      <path d="M6 8v4a4 4 0 0 0 4 4h2M18 8v2a4 4 0 0 1-4 4h-2" />
    </svg>
  )
}
function ErrorTinyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="size-3">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v6M12 16h.01" stroke="white" strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
  )
}
function WarnTinyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="size-3">
      <path d="M12 3 22 21H2L12 3Z" />
      <path d="M12 10v4M12 17h.01" stroke="white" strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
  )
}
