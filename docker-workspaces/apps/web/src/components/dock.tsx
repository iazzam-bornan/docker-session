import { cn } from "@workspace/ui/lib/utils"

import { AppIcon, APP_LABELS } from "@/components/app-icon"
import { useContextMenu, type ContextMenuItem } from "@/state/context-menu"
import { useWindows, type AppId } from "@/state/windows"

const PINNED: AppId[] = [
  "welcome",
  "files",
  "code",
  "terminal",
  "containers",
  "browser",
]
const TRAILING: AppId[] = ["settings"]

function DockButton({ app }: { app: AppId }) {
  const { open, close, focus, toggleMinimize, windows, focusedId } = useWindows()
  const ctx = useContextMenu()
  const open_win = windows.find((w) => w.app === app)
  const isOpen = !!open_win
  const isFocused = open_win && open_win.id === focusedId

  const onContextMenu = ctx.bind(() => {
    const items: ContextMenuItem[] = [
      { kind: "header", label: APP_LABELS[app] },
      {
        label: isOpen ? "Show" : "Open",
        onClick: () => {
          if (open_win) {
            focus(open_win.id)
          } else {
            open(app)
          }
        },
      },
    ]
    if (open_win) {
      items.push({
        label: open_win.minimized ? "Restore" : "Minimize",
        onClick: () => toggleMinimize(open_win.id),
      })
      items.push({ kind: "separator" })
      items.push({
        label: "Close",
        danger: true,
        onClick: () => close(open_win.id),
      })
    }
    return items
  })

  return (
    <button
      onClick={() => open(app)}
      onContextMenu={onContextMenu}
      className="group relative flex flex-col items-center"
    >
      {/* tooltip */}
      <span className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 scale-90 rounded-md border border-border bg-popover px-2 py-1 font-mono text-[10px] whitespace-nowrap text-popover-foreground opacity-0 shadow-lg backdrop-blur-md transition-all duration-150 group-hover:scale-100 group-hover:opacity-100">
        {APP_LABELS[app]}
      </span>

      <div
        className={cn(
          "transition-transform duration-200 group-hover:-translate-y-1",
          isFocused && "drop-shadow-[0_6px_14px_rgba(0,0,0,0.25)]"
        )}
      >
        <AppIcon app={app} size={44} />
      </div>

      {/* active dot */}
      <span
        className={cn(
          "absolute -bottom-1.5 size-1 rounded-full transition",
          isOpen ? "bg-foreground/85" : "bg-transparent"
        )}
      />
    </button>
  )
}

export function Dock() {
  return (
    <div className="pointer-events-none absolute right-0 bottom-3 left-0 z-30 flex justify-center">
      <div
        className="pointer-events-auto flex items-end gap-2.5 rounded-2xl border border-surface-glass-border bg-surface-glass px-3 py-2.5 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.45)] backdrop-blur-2xl"
      >
        {PINNED.map((app) => (
          <DockButton key={app} app={app} />
        ))}

        {/* separator */}
        <div className="mx-1 h-11 w-px self-center bg-border" />

        {TRAILING.map((app) => (
          <DockButton key={app} app={app} />
        ))}
      </div>
    </div>
  )
}
