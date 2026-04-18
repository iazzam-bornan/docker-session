/* eslint-disable react-refresh/only-export-components */
import * as React from "react"

// ─────────────────────────────────────────────────────────────────────────
// windows + workspace state
//
// this file owns three things, all wrapped in a single React context:
//
//   1. **window manager** — every open app window, with its position,
//      size, z-order, minimized/maximized flags. apps don't render
//      themselves; they're rendered by Desktop inside a <Window> chrome
//      that reads from this state.
//
//   2. **code app intent state** — codeFolder (the folder rooted in the
//      explorer), codeTabs (open editor tabs), codeActiveTab. lives here
//      so the files app and the terminal can both push files/folders into
//      the code app without holding a reference to its component, and so
//      the state survives the code window being closed.
//
//   3. **workspace persistence** — the entire workspace layout (windows
//      + code state) is serialized to localStorage on every change and
//      rehydrated on first mount. the next time the user logs in,
//      everything is right where they left it: same windows in the same
//      positions, same files open in the editor.
//
// persistence schema is versioned (`STORAGE_VERSION`) so we can change the
// shape later and just drop saves that don't match.
// ─────────────────────────────────────────────────────────────────────────

export type AppId =
  | "terminal"
  | "files"
  | "welcome"
  | "containers"
  | "settings"
  | "browser"
  | "code"

export type WindowState = {
  id: string
  app: AppId
  title: string
  x: number
  y: number
  width: number
  height: number
  z: number
  minimized: boolean
  maximized: boolean
  prevBounds?: { x: number; y: number; width: number; height: number }
}

type WindowsContextValue = {
  windows: WindowState[]
  focusedId: string | null
  open: (app: AppId) => void
  close: (id: string) => void
  focus: (id: string) => void
  toggleMinimize: (id: string) => void
  toggleMaximize: (id: string) => void
  move: (id: string, x: number, y: number) => void
  resize: (id: string, width: number, height: number) => void
  /**
   * Update position + size atomically. Used by the corner/edge resize
   * handles when dragging from a top or left edge changes both.
   */
  setBounds: (
    id: string,
    bounds: { x: number; y: number; width: number; height: number }
  ) => void

  // ─── code app intents ───────────────────────────────────────────────
  /**
   * The folder the code app's explorer is rooted at, as a path **relative
   * to home**. Empty string means home itself; null means the code app
   * has no folder open and shows its welcome pane. Set by `openFolderInCode`
   * (terminal `code .`, files app "Open with code" on a folder, code app
   * "Open Folder" menu).
   */
  codeFolder: string | null
  /** Files currently open as tabs in the code app, paths relative to home. */
  codeTabs: string[]
  /** The currently active editor tab in the code app, or null. */
  codeActiveTab: string | null
  /**
   * Open a single file in the code app. If no folder is currently open in
   * the code app, the file's parent directory becomes the folder. Opens or
   * focuses the code window. Path is relative to home.
   */
  openFileInCode: (path: string) => void
  /**
   * Open a folder in the code app's explorer. Replaces the current folder
   * (and clears all open tabs, just like a real editor's "Open Folder").
   * Opens or focuses the code window.
   */
  openFolderInCode: (path: string) => void
  /** Close the currently open folder and all tabs (back to welcome pane). */
  closeCodeFolder: () => void
  /** Switch which open tab is active. No-op if `path` isn't in codeTabs. */
  setCodeActiveTab: (path: string) => void
  /** Close a tab in the code app. Picks a new active tab if needed. */
  closeCodeTab: (path: string) => void
}

/** Minimum size a window can be dragged down to. */
export const MIN_WINDOW_WIDTH = 320
export const MIN_WINDOW_HEIGHT = 220

const WindowsContext = React.createContext<WindowsContextValue | undefined>(
  undefined
)

const APP_DEFAULTS: Record<
  AppId,
  { title: string; width: number; height: number }
> = {
  terminal: { title: "terminal", width: 720, height: 460 },
  files: { title: "files", width: 820, height: 540 },
  welcome: { title: "welcome", width: 560, height: 520 },
  containers: { title: "containers", width: 1100, height: 680 },
  settings: { title: "settings", width: 760, height: 520 },
  browser: { title: "browser", width: 880, height: 580 },
  code: { title: "code", width: 1040, height: 660 },
}

// ─── persistence ────────────────────────────────────────────────────────
//
// the entire workspace layout is dumped to localStorage on every change.
// the schema is versioned, so when we change the shape later we just bump
// the version and the old saves get ignored.

const STORAGE_KEY = "dockerlab.workspace.v2"

type PersistedWorkspace = {
  v: 2
  windows: WindowState[]
  focusedId: string | null
  codeFolder: string | null
  codeTabs: string[]
  codeActiveTab: string | null
  /** Highest z value seen, so newly-opened windows still come out on top. */
  zCounter: number
  /** Highest window id seen, so new ids don't collide with persisted ones. */
  idCounter: number
}

function loadWorkspace(): PersistedWorkspace | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PersistedWorkspace
    if (parsed.v !== 2) return null
    if (!Array.isArray(parsed.windows)) return null
    return parsed
  } catch {
    return null
  }
}

function saveWorkspace(snapshot: PersistedWorkspace): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
  } catch {
    /* quota exceeded or storage disabled — silently drop */
  }
}

let zCounter = 10
let idCounter = 0
const nextZ = () => ++zCounter
const nextId = () => `w${++idCounter}`

export function WindowsProvider({ children }: { children: React.ReactNode }) {
  // ─── rehydrate from localStorage on first mount ─────────────────────
  // we read once, synchronously, before any state is created so the
  // restored windows render in their final positions instead of flashing
  // through the defaults.
  const initial = React.useMemo(() => loadWorkspace(), [])
  React.useEffect(() => {
    if (initial) {
      // sync the global counters so newly-opened windows don't reuse ids
      zCounter = Math.max(zCounter, initial.zCounter)
      idCounter = Math.max(idCounter, initial.idCounter)
    }
  }, [initial])

  const [windows, setWindows] = React.useState<WindowState[]>(
    initial?.windows ?? []
  )
  const [focusedId, setFocusedId] = React.useState<string | null>(
    initial?.focusedId ?? null
  )
  const [codeFolder, setCodeFolder] = React.useState<string | null>(
    initial?.codeFolder ?? null
  )
  const [codeTabs, setCodeTabs] = React.useState<string[]>(
    initial?.codeTabs ?? []
  )
  const [codeActiveTab, setCodeActiveTab] = React.useState<string | null>(
    initial?.codeActiveTab ?? null
  )

  // persist on every change. we debounce by stuffing the latest snapshot
  // into a ref and writing in a microtask, so a flurry of state updates
  // (drag-resize) don't beat localStorage to death.
  const persistTimer = React.useRef<number | null>(null)
  React.useEffect(() => {
    if (persistTimer.current !== null) {
      window.clearTimeout(persistTimer.current)
    }
    persistTimer.current = window.setTimeout(() => {
      saveWorkspace({
        v: 2,
        windows,
        focusedId,
        codeFolder,
        codeTabs,
        codeActiveTab,
        zCounter,
        idCounter,
      })
      persistTimer.current = null
    }, 120)
    return () => {
      if (persistTimer.current !== null) {
        window.clearTimeout(persistTimer.current)
        persistTimer.current = null
      }
    }
  }, [windows, focusedId, codeFolder, codeTabs, codeActiveTab])

  // ─── window manager actions ─────────────────────────────────────────
  const open = React.useCallback((app: AppId) => {
    setWindows((current) => {
      // If already open and not minimized, just focus it.
      const existing = current.find((w) => w.app === app)
      if (existing) {
        const z = nextZ()
        setFocusedId(existing.id)
        return current.map((w) =>
          w.id === existing.id ? { ...w, z, minimized: false } : w
        )
      }
      const defaults = APP_DEFAULTS[app]
      // stagger position so multiple windows don't pile up
      const offset = current.length * 28
      const id = nextId()
      const win: WindowState = {
        id,
        app,
        title: defaults.title,
        x: 96 + offset,
        y: 72 + offset,
        width: defaults.width,
        height: defaults.height,
        z: nextZ(),
        minimized: false,
        maximized: false,
      }
      setFocusedId(id)
      return [...current, win]
    })
  }, [])

  const close = React.useCallback((id: string) => {
    setWindows((current) => current.filter((w) => w.id !== id))
    setFocusedId((curr) => (curr === id ? null : curr))
  }, [])

  const focus = React.useCallback((id: string) => {
    setWindows((current) => {
      const z = nextZ()
      return current.map((w) =>
        w.id === id ? { ...w, z, minimized: false } : w
      )
    })
    setFocusedId(id)
  }, [])

  const toggleMinimize = React.useCallback((id: string) => {
    setWindows((current) =>
      current.map((w) => (w.id === id ? { ...w, minimized: !w.minimized } : w))
    )
  }, [])

  const toggleMaximize = React.useCallback((id: string) => {
    setWindows((current) =>
      current.map((w) => {
        if (w.id !== id) return w
        if (w.maximized) {
          const prev = w.prevBounds
          return {
            ...w,
            maximized: false,
            prevBounds: undefined,
            x: prev?.x ?? w.x,
            y: prev?.y ?? w.y,
            width: prev?.width ?? w.width,
            height: prev?.height ?? w.height,
          }
        }
        return {
          ...w,
          maximized: true,
          prevBounds: { x: w.x, y: w.y, width: w.width, height: w.height },
          x: 0,
          y: 0,
          width: window.innerWidth,
          height: window.innerHeight,
        }
      })
    )
  }, [])

  const move = React.useCallback((id: string, x: number, y: number) => {
    setWindows((current) =>
      current.map((w) => (w.id === id ? { ...w, x, y } : w))
    )
  }, [])

  const resize = React.useCallback(
    (id: string, width: number, height: number) => {
      setWindows((current) =>
        current.map((w) => (w.id === id ? { ...w, width, height } : w))
      )
    },
    []
  )

  const setBounds = React.useCallback(
    (
      id: string,
      bounds: { x: number; y: number; width: number; height: number }
    ) => {
      setWindows((current) =>
        current.map((w) => (w.id === id ? { ...w, ...bounds } : w))
      )
    },
    []
  )

  // ─── code app intents ───────────────────────────────────────────────
  // openFolderInCode replaces the current code folder + clears tabs, just
  // like a real editor's "Open Folder". this is the right behavior because
  // tabs are paths relative to home so they'd still resolve, but the
  // explorer would no longer show their parent — confusing.
  const openFolderInCode = React.useCallback(
    (path: string) => {
      setCodeFolder(path)
      setCodeTabs([])
      setCodeActiveTab(null)
      open("code")
    },
    [open]
  )

  const closeCodeFolder = React.useCallback(() => {
    setCodeFolder(null)
    setCodeTabs([])
    setCodeActiveTab(null)
  }, [])

  // openFileInCode is for "open just this one file". if the code app
  // already has a folder open, the file is added as a tab inside that
  // folder. if it doesn't, the file's parent directory becomes the
  // folder so the explorer has *something* to show.
  const openFileInCode = React.useCallback(
    (path: string) => {
      setCodeFolder((currentFolder) => {
        if (currentFolder !== null) return currentFolder
        // pick the file's parent directory as the implicit folder
        const slashIdx = path.lastIndexOf("/")
        return slashIdx >= 0 ? path.slice(0, slashIdx) : ""
      })
      setCodeTabs((current) =>
        current.includes(path) ? current : [...current, path]
      )
      setCodeActiveTab(path)
      open("code")
    },
    [open]
  )

  const closeCodeTab = React.useCallback((path: string) => {
    setCodeTabs((current) => {
      const idx = current.indexOf(path)
      if (idx === -1) return current
      const next = current.filter((p) => p !== path)
      // pick a sensible new active tab — the neighbor on the right, or the
      // last tab if we just closed the rightmost.
      setCodeActiveTab((active) => {
        if (active !== path) return active
        if (next.length === 0) return null
        return next[Math.min(idx, next.length - 1)]
      })
      return next
    })
  }, [])

  const setCodeActiveTabSafe = React.useCallback(
    (path: string) => {
      setCodeActiveTab((current) => (codeTabs.includes(path) ? path : current))
    },
    [codeTabs]
  )

  const value = React.useMemo(
    () => ({
      windows,
      focusedId,
      open,
      close,
      focus,
      toggleMinimize,
      toggleMaximize,
      move,
      resize,
      setBounds,
      codeFolder,
      codeTabs,
      codeActiveTab,
      openFileInCode,
      openFolderInCode,
      closeCodeFolder,
      setCodeActiveTab: setCodeActiveTabSafe,
      closeCodeTab,
    }),
    [
      windows,
      focusedId,
      open,
      close,
      focus,
      toggleMinimize,
      toggleMaximize,
      move,
      resize,
      setBounds,
      codeFolder,
      codeTabs,
      codeActiveTab,
      openFileInCode,
      openFolderInCode,
      closeCodeFolder,
      setCodeActiveTabSafe,
      closeCodeTab,
    ]
  )

  return (
    <WindowsContext.Provider value={value}>{children}</WindowsContext.Provider>
  )
}

export function useWindows() {
  const ctx = React.useContext(WindowsContext)
  if (!ctx) throw new Error("useWindows must be used within WindowsProvider")
  return ctx
}
