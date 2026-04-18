import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"

import { AppIcon, APP_LABELS } from "@/components/app-icon"
import { useContextMenu } from "@/state/context-menu"
import { useWindows, type AppId } from "@/state/windows"

const APPS: AppId[] = [
  "welcome",
  "files",
  "code",
  "terminal",
  "containers",
  "browser",
]

// grid system: cells are CELL_W × CELL_H, anchored at (GRID_X, GRID_Y).
// dragging snaps to the nearest grid cell, like a real desktop.
const CELL_W = 92
const CELL_H = 100
const GRID_X = 24
const GRID_Y = 56
const STORAGE_KEY = "dockerlab.desktop.icons.v1"

type Pos = { col: number; row: number }
type PositionMap = Record<string, Pos>

function defaultPositions(): PositionMap {
  // initial single column on the left
  return APPS.reduce<PositionMap>((acc, app, i) => {
    acc[app] = { col: 0, row: i }
    return acc
  }, {})
}

function loadPositions(): PositionMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultPositions()
    const parsed = JSON.parse(raw) as PositionMap
    // ensure every app has a slot, falling back to defaults for new apps
    const defaults = defaultPositions()
    for (const app of APPS) {
      if (!parsed[app]) parsed[app] = defaults[app]
    }
    return parsed
  } catch {
    return defaultPositions()
  }
}

function gridToPx(p: Pos) {
  return {
    left: GRID_X + p.col * CELL_W,
    top: GRID_Y + p.row * CELL_H,
  }
}

function pxToGrid(x: number, y: number): Pos {
  const col = Math.max(0, Math.round((x - GRID_X) / CELL_W))
  const row = Math.max(0, Math.round((y - GRID_Y) / CELL_H))
  return { col, row }
}

export function DesktopIcons() {
  const { open, close, focus, windows, focusedId } = useWindows()
  const ctx = useContextMenu()
  const [positions, setPositions] = React.useState<PositionMap>(loadPositions)
  const [selected, setSelected] = React.useState<AppId | null>(null)
  const [dragging, setDragging] = React.useState<{
    app: AppId
    x: number
    y: number
  } | null>(null)

  // persist positions whenever they change
  React.useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(positions))
  }, [positions])

  // global click → deselect (icons stop propagation so this only fires on the
  // desktop background or other windows)
  React.useEffect(() => {
    const onWindowClick = () => setSelected(null)
    window.addEventListener("mousedown", onWindowClick)
    return () => window.removeEventListener("mousedown", onWindowClick)
  }, [])

  const dragState = React.useRef<{
    app: AppId
    pointerId: number
    offsetX: number
    offsetY: number
    moved: boolean
  } | null>(null)

  // ensure no two icons share a cell after a drop
  const resolveCollision = React.useCallback(
    (app: AppId, target: Pos): PositionMap => {
      // first try the target. if a different app already lives there, swap.
      const occupant = (Object.keys(positions) as AppId[]).find(
        (other) =>
          other !== app &&
          positions[other].col === target.col &&
          positions[other].row === target.row
      )
      if (occupant) {
        return {
          ...positions,
          [app]: target,
          [occupant]: positions[app],
        }
      }
      return { ...positions, [app]: target }
    },
    [positions]
  )

  const onPointerDown = (
    e: React.PointerEvent<HTMLButtonElement>,
    app: AppId
  ) => {
    if (e.button !== 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    dragState.current = {
      app,
      pointerId: e.pointerId,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      moved: false,
    }
    e.currentTarget.setPointerCapture(e.pointerId)
    setSelected(app)
  }

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragState.current
    if (!d) return
    if (!d.moved) {
      // require a small movement before we consider it a drag
      // (otherwise simple clicks get treated as drags)
      const px = e.clientX
      const py = e.clientY
      const start = e.currentTarget.getBoundingClientRect()
      if (
        Math.abs(px - (start.left + d.offsetX)) < 4 &&
        Math.abs(py - (start.top + d.offsetY)) < 4
      ) {
        return
      }
      d.moved = true
    }
    setDragging({
      app: d.app,
      x: e.clientX - d.offsetX,
      y: e.clientY - d.offsetY,
    })
  }

  const onPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragState.current
    if (!d) return
    try {
      e.currentTarget.releasePointerCapture(d.pointerId)
    } catch {
      /* noop */
    }
    if (d.moved && dragging) {
      const target = pxToGrid(dragging.x, dragging.y)
      setPositions(resolveCollision(d.app, target))
    }
    dragState.current = null
    setDragging(null)
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      {APPS.map((app) => {
        const pos = positions[app]
        const px =
          dragging?.app === app
            ? { left: dragging.x, top: dragging.y }
            : gridToPx(pos)
        const open_win = windows.find((w) => w.app === app)
        const isOpen = !!open_win
        const isFocused = open_win && open_win.id === focusedId
        const isSelected = selected === app
        const isDraggingMe = dragging?.app === app

        const onContextMenu = ctx.bind(() => {
          setSelected(app)
          return [
            { kind: "header" as const, label: APP_LABELS[app] },
            {
              label: isOpen ? "Bring to Front" : "Open",
              onClick: () => {
                if (open_win) {
                  focus(open_win.id)
                } else {
                  open(app)
                }
              },
            },
            ...(isOpen && open_win
              ? [
                  { kind: "separator" as const },
                  {
                    label: "Close Window",
                    danger: true,
                    onClick: () => close(open_win.id),
                  },
                ]
              : []),
          ]
        })

        return (
          <button
            key={app}
            type="button"
            onPointerDown={(e) => {
              e.stopPropagation()
              onPointerDown(e, app)
            }}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={() => open(app)}
            onContextMenu={onContextMenu}
            style={{
              left: px.left,
              top: px.top,
              width: 80,
            }}
            className={cn(
              "group pointer-events-auto absolute flex flex-col items-center gap-1.5 rounded-2xl px-1 py-2 select-none",
              isDraggingMe
                ? "z-50 cursor-grabbing"
                : "cursor-pointer transition-[background,transform] duration-150",
              isSelected && !isDraggingMe && "bg-surface-glass border border-surface-glass-border backdrop-blur-md",
              !isSelected && !isDraggingMe && "hover:bg-surface-elevated"
            )}
          >
            <div
              className={cn(
                "transition-transform duration-150",
                isDraggingMe
                  ? "scale-110"
                  : "group-hover:-translate-y-0.5"
              )}
            >
              <AppIcon app={app} size={48} />
            </div>
            <span
              className={cn(
                "max-w-full truncate rounded px-1 font-mono text-[10px] transition",
                isSelected
                  ? "bg-surface-elevated text-foreground"
                  : "text-foreground/80 group-hover:text-foreground",
                // Subtle text shadow so labels stay legible against busy
                // wallpapers regardless of theme.
                "[text-shadow:0_1px_2px_oklch(0_0_0_/_0.55)]"
              )}
            >
              {APP_LABELS[app]}
            </span>
            {isOpen && !isDraggingMe && (
              <span
                className={cn(
                  "absolute top-3 right-1 size-1.5 rounded-full",
                  isFocused ? "bg-foreground" : "bg-foreground/55"
                )}
              />
            )}
          </button>
        )
      })}
    </div>
  )
}
