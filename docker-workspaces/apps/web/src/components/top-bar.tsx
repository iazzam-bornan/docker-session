import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"

import {
  BatteryIcon,
  BellIcon,
  BluetoothIcon,
  VolumeIcon,
  WifiIcon,
} from "@/components/system-icons"
import { useDaemon } from "@/state/daemon"
import { useSession } from "@/state/session"
import { useSystem } from "@/state/system"
import { useWindows } from "@/state/windows"

function useClock() {
  const [now, setNow] = React.useState(() => new Date())
  React.useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(id)
  }, [])
  return now
}

type TopBarProps = {
  onTrayClick: () => void
  trayOpen: boolean
}

export function TopBar({ onTrayClick, trayOpen }: TopBarProps) {
  const { user } = useSession()
  const { windows, focusedId } = useWindows()
  const sys = useSystem()
  const daemon = useDaemon()
  const now = useClock()

  const focused = windows.find((w) => w.id === focusedId)
  const time = now.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })
  const date = now
    .toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    })
    .toLowerCase()

  return (
    <div className="absolute top-0 right-0 left-0 z-40 flex h-8 items-center justify-between border-b border-surface-glass-border bg-surface-glass px-3 text-[11px] text-foreground/75 backdrop-blur-xl">
      {/* left — brand + focused app + daemon dot */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 px-1.5">
          <span
            className={cn(
              "size-1.5 rounded-full",
              daemon.connection === "open"
                ? "bg-emerald-400"
                : daemon.connection === "connecting"
                  ? "bg-amber-300 animate-pulse"
                  : "bg-red-400/80"
            )}
            title={`daemon: ${daemon.connection}`}
          />
          <span className="font-semibold tracking-wide text-foreground">
            dockerlab
          </span>
          {daemon.sessionId && (
            <span className="font-mono text-foreground/45">
              · {daemon.sessionId}
            </span>
          )}
        </div>
        {focused && (
          <>
            <span className="text-foreground/15">|</span>
            <span className="font-mono text-foreground/65">{focused.title}</span>
          </>
        )}
      </div>

      {/* right — system tray */}
      <button
        type="button"
        onClick={onTrayClick}
        className={cn(
          "flex h-7 items-center gap-3 rounded-md px-2 transition",
          trayOpen ? "bg-surface-elevated" : "hover:bg-surface-elevated"
        )}
      >
        <BellIcon className="size-3.5 text-foreground/65" />
        <BluetoothIcon
          className={cn(
            "size-3.5 transition",
            sys.bluetoothOn ? "text-foreground/80" : "text-foreground/25"
          )}
        />
        <div className="flex items-center gap-1">
          <VolumeIcon level={sys.volume} className="size-4 text-foreground/80" />
        </div>
        <WifiIcon
          className={cn(
            "size-4 transition",
            sys.wifiOn ? "text-foreground/80" : "text-foreground/25"
          )}
        />
        <div className="flex items-center gap-1">
          <BatteryIcon level={sys.battery} className="h-3 w-5 text-foreground/80" />
          <span className="font-mono text-[10px] tabular-nums text-foreground/65">
            {sys.battery}%
          </span>
        </div>
        <div className="flex items-center gap-1.5 border-l border-border pl-3">
          <span className="font-mono tabular-nums text-foreground">{time}</span>
          <span className="font-mono text-[10px] text-foreground/45">{date}</span>
        </div>
        <div className="flex items-center gap-1.5 border-l border-border pl-3">
          <div className="grid size-4 place-items-center rounded-full border border-border bg-surface-elevated text-[9px] font-medium text-foreground/85">
            {user?.name.charAt(0).toUpperCase() ?? "?"}
          </div>
          <span className="text-foreground/65">{user?.name ?? "guest"}</span>
        </div>
      </button>
    </div>
  )
}
