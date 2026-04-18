import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"

import {
  MIN_WINDOW_HEIGHT,
  MIN_WINDOW_WIDTH,
  useWindows,
  type WindowState,
} from "@/state/windows"

type WindowProps = {
  win: WindowState
  children: React.ReactNode
}

// 8 resize handle directions, like every desktop OS. each one mutates a
// different combination of (x, y, width, height) when dragged.
type ResizeDir = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw"

export function Window({ win, children }: WindowProps) {
  const {
    focus,
    close,
    toggleMinimize,
    toggleMaximize,
    move,
    setBounds,
    focusedId,
  } = useWindows()
  const isFocused = focusedId === win.id

  // ─── drag (title bar) ────────────────────────────────────────────────
  const dragging = React.useRef<{
    startX: number
    startY: number
    originX: number
    originY: number
  } | null>(null)

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("[data-no-drag]")) return
    focus(win.id)
    if (win.maximized) return
    dragging.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: win.x,
      originY: win.y,
    }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragging.current
    if (!d) return
    const nextX = d.originX + (e.clientX - d.startX)
    const nextY = Math.max(8, d.originY + (e.clientY - d.startY))
    move(win.id, nextX, nextY)
  }

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = null
    try {
      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {
      /* noop */
    }
  }

  const onTitleDoubleClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("[data-no-drag]")) return
    toggleMaximize(win.id)
  }

  // ─── resize ──────────────────────────────────────────────────────────
  const resizing = React.useRef<{
    dir: ResizeDir
    startX: number
    startY: number
    origin: { x: number; y: number; width: number; height: number }
  } | null>(null)

  const startResize =
    (dir: ResizeDir) => (e: React.PointerEvent<HTMLDivElement>) => {
      if (win.maximized) return
      e.stopPropagation()
      focus(win.id)
      resizing.current = {
        dir,
        startX: e.clientX,
        startY: e.clientY,
        origin: {
          x: win.x,
          y: win.y,
          width: win.width,
          height: win.height,
        },
      }
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    }

  const onResizeMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = resizing.current
    if (!r) return
    const dx = e.clientX - r.startX
    const dy = e.clientY - r.startY
    let { x, y, width, height } = r.origin

    // Handle west edges: reduce width as the user drags right (positive dx),
    // and shift x by the same amount so the right edge stays put. Clamp at
    // min width by holding x steady once we hit the floor.
    if (r.dir === "w" || r.dir === "nw" || r.dir === "sw") {
      const newWidth = Math.max(MIN_WINDOW_WIDTH, r.origin.width - dx)
      const consumed = r.origin.width - newWidth
      width = newWidth
      x = r.origin.x + consumed
    }
    // East edges: just grow width.
    if (r.dir === "e" || r.dir === "ne" || r.dir === "se") {
      width = Math.max(MIN_WINDOW_WIDTH, r.origin.width + dx)
    }
    // North edges: same as west but vertical.
    if (r.dir === "n" || r.dir === "ne" || r.dir === "nw") {
      const newHeight = Math.max(MIN_WINDOW_HEIGHT, r.origin.height - dy)
      const consumed = r.origin.height - newHeight
      height = newHeight
      y = Math.max(8, r.origin.y + consumed)
    }
    // South edges: just grow height.
    if (r.dir === "s" || r.dir === "se" || r.dir === "sw") {
      height = Math.max(MIN_WINDOW_HEIGHT, r.origin.height + dy)
    }

    setBounds(win.id, { x, y, width, height })
  }

  const onResizeUp = (e: React.PointerEvent<HTMLDivElement>) => {
    resizing.current = null
    try {
      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {
      /* noop */
    }
  }

  if (win.minimized) return null

  return (
    <div
      className={cn(
        "absolute flex flex-col overflow-hidden border bg-card text-card-foreground transition-[border-radius] duration-150",
        win.maximized ? "rounded-none" : "rounded-lg",
        isFocused
          ? "border-border shadow-[0_24px_60px_-20px_rgba(0,0,0,0.5)]"
          : "border-border shadow-[0_16px_40px_-20px_rgba(0,0,0,0.35)]"
      )}
      style={{
        left: win.x,
        top: win.y,
        width: win.width,
        height: win.height,
        zIndex: win.maximized ? 100 : win.z,
      }}
      onMouseDown={() => focus(win.id)}
    >
      {/* title bar */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={onTitleDoubleClick}
        className={cn(
          "flex h-8 items-center gap-3 border-b border-border px-3 select-none",
          win.maximized
            ? "cursor-default"
            : "cursor-grab active:cursor-grabbing",
          isFocused ? "bg-surface-elevated" : "bg-transparent"
        )}
      >
        <div className="flex items-center gap-1.5" data-no-drag>
          <button
            onClick={() => close(win.id)}
            aria-label="close"
            className="size-2.5 rounded-full bg-red-400/90 hover:brightness-125"
          />
          <button
            onClick={() => toggleMinimize(win.id)}
            aria-label="minimize"
            className="size-2.5 rounded-full bg-amber-300/90 hover:brightness-125"
          />
          <button
            onClick={() => toggleMaximize(win.id)}
            aria-label={win.maximized ? "restore" : "maximize"}
            className="size-2.5 rounded-full bg-emerald-400/80 hover:brightness-125"
          />
        </div>
        <div className="flex-1 text-center font-mono text-[11px] text-muted-foreground">
          {win.title}
        </div>
        <div className="w-12" />
      </div>

      {/* body */}
      <div className="relative flex min-h-0 flex-1 flex-col">{children}</div>

      {/* ── resize handles ─────────────────────────────────────────────
          Eight handles laid over the window: four edges and four corners.
          They sit ABOVE the body (z-index by virtue of being later in DOM
          order) but below any modal popover that uses absolute positioning.
          Skipped entirely while maximized so the user can't accidentally
          fight the maximize state. */}
      {!win.maximized && (
        <>
          {/* edges */}
          <ResizeHandle
            dir="n"
            className="absolute inset-x-2 top-0 h-1 cursor-ns-resize"
            onPointerDown={startResize("n")}
            onPointerMove={onResizeMove}
            onPointerUp={onResizeUp}
          />
          <ResizeHandle
            dir="s"
            className="absolute inset-x-2 bottom-0 h-1 cursor-ns-resize"
            onPointerDown={startResize("s")}
            onPointerMove={onResizeMove}
            onPointerUp={onResizeUp}
          />
          <ResizeHandle
            dir="e"
            className="absolute inset-y-2 right-0 w-1 cursor-ew-resize"
            onPointerDown={startResize("e")}
            onPointerMove={onResizeMove}
            onPointerUp={onResizeUp}
          />
          <ResizeHandle
            dir="w"
            className="absolute inset-y-2 left-0 w-1 cursor-ew-resize"
            onPointerDown={startResize("w")}
            onPointerMove={onResizeMove}
            onPointerUp={onResizeUp}
          />
          {/* corners */}
          <ResizeHandle
            dir="nw"
            className="absolute top-0 left-0 size-3 cursor-nwse-resize"
            onPointerDown={startResize("nw")}
            onPointerMove={onResizeMove}
            onPointerUp={onResizeUp}
          />
          <ResizeHandle
            dir="ne"
            className="absolute top-0 right-0 size-3 cursor-nesw-resize"
            onPointerDown={startResize("ne")}
            onPointerMove={onResizeMove}
            onPointerUp={onResizeUp}
          />
          <ResizeHandle
            dir="sw"
            className="absolute bottom-0 left-0 size-3 cursor-nesw-resize"
            onPointerDown={startResize("sw")}
            onPointerMove={onResizeMove}
            onPointerUp={onResizeUp}
          />
          <ResizeHandle
            dir="se"
            className="absolute right-0 bottom-0 size-3 cursor-nwse-resize"
            onPointerDown={startResize("se")}
            onPointerMove={onResizeMove}
            onPointerUp={onResizeUp}
          />
        </>
      )}
    </div>
  )
}

// thin wrapper around a resize handle div. lives in its own component so
// pointer capture is scoped per-handle and we don't have to thread refs.
function ResizeHandle({
  dir,
  className,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  dir: ResizeDir
  className: string
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void
  onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void
  onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void
}) {
  return (
    <div
      data-resize-dir={dir}
      className={cn("z-20 select-none", className)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    />
  )
}
