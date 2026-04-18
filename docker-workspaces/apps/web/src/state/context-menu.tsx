/* eslint-disable react-refresh/only-export-components */
import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"

// ─────────────────────────────────────────────────────────────────────────
// shared context menu (right-click) system
//
// every app uses the same `useContextMenu()` hook to attach a right-click
// menu to a JSX element. items are passed as a function so the call site
// can build them lazily — we don't want to recompute every render.
//
// usage:
//   const ctx = useContextMenu()
//   <div onContextMenu={ctx.bind(() => [
//     { label: "Open", onClick: () => open() },
//     { kind: "separator" },
//     { label: "Delete", danger: true, onClick: () => del() },
//   ])} />
//
// rendering & dismissal lives in the provider. apps don't need to track
// menu visibility or clean up listeners themselves.
//
// the provider also installs a global `contextmenu` handler that
// **suppresses the native browser menu** anywhere it isn't claimed by
// a specific item. this matches a real OS: right-clicking the wallpaper
// shows desktop options, not "View page source".
// ─────────────────────────────────────────────────────────────────────────

export type ContextMenuItem =
  | {
      kind?: "item"
      label: string
      /** optional shortcut text shown right-aligned (e.g. "⌘C") */
      shortcut?: string
      /** rendered at 14px in the leading slot */
      icon?: React.ReactNode
      /** disable the item without hiding it */
      disabled?: boolean
      /** color the item red — for destructive actions */
      danger?: boolean
      /** click handler — the menu closes itself before this fires */
      onClick: () => void
    }
  | { kind: "separator" }
  | {
      /** non-clickable section header (e.g. "Edit") */
      kind: "header"
      label: string
    }

type ItemBuilder = () => ContextMenuItem[]

type MenuState = {
  x: number
  y: number
  items: ContextMenuItem[]
}

type ContextMenuValue = {
  /**
   * Returns an `onContextMenu` handler that opens the shared menu at the
   * cursor with the items returned by `build`. Call this in your JSX:
   *
   *   <button onContextMenu={ctx.bind(() => [...])}>
   *
   * If `build` returns an empty array the menu doesn't open at all
   * (the native menu is still suppressed).
   */
  bind: (build: ItemBuilder) => (e: React.MouseEvent) => void
  /** Imperatively open the menu (rare — used by code-app folder picker). */
  open: (x: number, y: number, items: ContextMenuItem[]) => void
  /** Close any open menu. */
  close: () => void
}

const ContextMenuContext = React.createContext<ContextMenuValue | undefined>(
  undefined
)

export function ContextMenuProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [menu, setMenu] = React.useState<MenuState | null>(null)

  const close = React.useCallback(() => setMenu(null), [])

  const open = React.useCallback(
    (x: number, y: number, items: ContextMenuItem[]) => {
      if (items.length === 0) return
      setMenu({ x, y, items })
    },
    []
  )

  const bind = React.useCallback(
    (build: ItemBuilder) => {
      return (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        open(e.clientX, e.clientY, build())
      }
    },
    [open]
  )

  // ─── global "no native menu" suppressor ──────────────────────────────
  // we want right-clicking *anywhere* in the app to either show our menu
  // or do nothing — never the browser's "View page source" menu. handlers
  // bound via `bind()` already preventDefault, so this catches everything
  // else.
  React.useEffect(() => {
    const onCtx = (e: MouseEvent) => {
      e.preventDefault()
    }
    window.addEventListener("contextmenu", onCtx)
    return () => window.removeEventListener("contextmenu", onCtx)
  }, [])

  // dismiss on outside click / escape / scroll / window resize
  React.useEffect(() => {
    if (!menu) return
    const onDown = () => close()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close()
    }
    const onResize = () => close()
    // IMPORTANT: bubble phase (no `true` flag) so the FloatingMenu's
    // onMouseDown + stopPropagation can prevent the close when the user
    // clicks *inside* the menu. capture phase would fire before the menu
    // ever gets a chance to stop propagation, making all items dead.
    window.addEventListener("mousedown", onDown)
    window.addEventListener("keydown", onKey)
    window.addEventListener("resize", onResize)
    window.addEventListener("blur", close)
    return () => {
      window.removeEventListener("mousedown", onDown)
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("resize", onResize)
      window.removeEventListener("blur", close)
    }
  }, [menu, close])

  const value = React.useMemo(
    () => ({ bind, open, close }),
    [bind, open, close]
  )

  return (
    <ContextMenuContext.Provider value={value}>
      {children}
      {menu && <FloatingMenu menu={menu} onClose={close} />}
    </ContextMenuContext.Provider>
  )
}

export function useContextMenu(): ContextMenuValue {
  const ctx = React.useContext(ContextMenuContext)
  if (!ctx) {
    throw new Error("useContextMenu must be used within ContextMenuProvider")
  }
  return ctx
}

// ─── floating menu ──────────────────────────────────────────────────────

function FloatingMenu({
  menu,
  onClose,
}: {
  menu: MenuState
  onClose: () => void
}) {
  const ref = React.useRef<HTMLDivElement | null>(null)
  // measure on mount and clamp the menu to the viewport so it never gets
  // cut off when right-clicking near the edge
  const [pos, setPos] = React.useState<{ x: number; y: number }>({
    x: menu.x,
    y: menu.y,
  })
  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const margin = 6
    let x = menu.x
    let y = menu.y
    if (x + r.width + margin > window.innerWidth) {
      x = Math.max(margin, window.innerWidth - r.width - margin)
    }
    if (y + r.height + margin > window.innerHeight) {
      y = Math.max(margin, window.innerHeight - r.height - margin)
    }
    setPos({ x, y })
  }, [menu.x, menu.y])

  return (
    <div
      ref={ref}
      role="menu"
      // capture mousedown to keep the global dismissal handler from firing
      onMouseDown={(e) => e.stopPropagation()}
      className="fixed z-[200] min-w-[200px] rounded-md border border-border bg-popover py-1 text-popover-foreground shadow-2xl backdrop-blur-md"
      style={{
        left: pos.x,
        top: pos.y,
      }}
    >
      {menu.items.map((item, i) => {
        if (item.kind === "separator") {
          return (
            <div
              key={`sep-${i}`}
              className="my-1 h-px bg-border"
              role="separator"
            />
          )
        }
        if (item.kind === "header") {
          return (
            <div
              key={`hdr-${i}`}
              className="px-3 py-1 font-mono text-[9px] tracking-widest text-foreground/45 uppercase"
            >
              {item.label}
            </div>
          )
        }
        return (
          <button
            key={`item-${i}-${item.label}`}
            type="button"
            disabled={item.disabled}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              if (item.disabled) return
              // capture the action ref before closing — closing unmounts us
              const action = item.onClick
              onClose()
              // fire after React processes the close so the menu is gone
              // before any dialogs (confirm/prompt) or state changes land
              requestAnimationFrame(() => action())
            }}
            className={cn(
              "flex w-full items-center gap-2 px-3 py-1 text-left text-[12px]",
              item.disabled
                ? "text-foreground/30"
                : item.danger
                  ? "text-red-400/85 hover:bg-red-400/10 hover:text-red-300"
                  : "text-foreground/85 hover:bg-surface-elevated hover:text-foreground"
            )}
          >
            {item.icon && (
              <span className="grid size-3.5 place-items-center text-foreground/55">
                {item.icon}
              </span>
            )}
            <span className="flex-1 truncate">{item.label}</span>
            {item.shortcut && (
              <span className="font-mono text-[10px] text-foreground/35">
                {item.shortcut}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
