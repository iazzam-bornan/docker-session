import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"

import {
  BatteryIcon,
  BluetoothIcon,
  GearIcon,
  MoonIcon,
  PowerIcon,
  SignOutIcon,
  SunIcon,
  VolumeIcon,
  WifiIcon,
} from "@/components/system-icons"
import { useAppearance } from "@/state/appearance"
import { useSession } from "@/state/session"
import { useSystem } from "@/state/system"
import { useWindows } from "@/state/windows"

type QuickSettingsProps = {
  onClose: () => void
}

type ToggleProps = {
  label: string
  sub?: string
  on: boolean
  onClick: () => void
  icon: React.ReactNode
}

function Toggle({ label, sub, on, onClick, icon }: ToggleProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-start gap-2 rounded-xl border p-3 text-left transition",
        on
          ? "border-border bg-surface-elevated text-foreground"
          : "border-border bg-transparent text-foreground/55 hover:bg-surface-elevated hover:text-foreground/80"
      )}
    >
      <div className="flex w-full items-center justify-between">
        <span
          className={cn(
            "grid size-7 place-items-center rounded-lg",
            on ? "bg-surface-elevated" : "bg-transparent"
          )}
        >
          {icon}
        </span>
        <span
          className={cn(
            "size-1.5 rounded-full transition",
            on ? "bg-primary" : "bg-foreground/15"
          )}
        />
      </div>
      <div className="min-w-0">
        <div className="text-[12px] leading-tight">{label}</div>
        {sub && (
          <div className="mt-0.5 truncate font-mono text-[10px] text-foreground/40">
            {sub}
          </div>
        )}
      </div>
    </button>
  )
}

function Slider({
  value,
  onChange,
  leadingIcon,
}: {
  value: number
  onChange: (v: number) => void
  leadingIcon: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-transparent px-3 py-2.5">
      <span className="text-foreground/65">{leadingIcon}</span>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="slider-track flex-1"
      />
      <span className="w-7 text-right font-mono text-[10px] tabular-nums text-foreground/55">
        {value}
      </span>
    </div>
  )
}

export function QuickSettings({ onClose }: QuickSettingsProps) {
  const { user, signOut } = useSession()
  const sys = useSystem()
  const { open } = useWindows()
  const { resolvedTheme, toggleTheme } = useAppearance()
  const isDark = resolvedTheme === "dark"

  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!ref.current) return
      if (!ref.current.contains(e.target as Node)) onClose()
    }
    // delay so the opening click doesn't immediately close it
    const id = window.setTimeout(() => {
      document.addEventListener("mousedown", onDown)
    }, 0)
    return () => {
      window.clearTimeout(id)
      document.removeEventListener("mousedown", onDown)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      className="window-in absolute top-9 right-2 z-50 w-80 rounded-2xl border border-border bg-popover p-3 text-popover-foreground shadow-[0_24px_60px_-20px_rgba(0,0,0,0.45)] backdrop-blur-2xl"
    >
      {/* user header */}
      <div className="mb-3 flex items-center gap-3 rounded-xl border border-border bg-transparent px-3 py-2.5">
        <div className="grid size-9 place-items-center rounded-full border border-border bg-surface-elevated text-sm font-medium text-foreground">
          {user?.name.charAt(0).toUpperCase() ?? "?"}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] text-foreground">
            {user?.name ?? "guest"}
          </div>
          <div className="truncate font-mono text-[10px] text-foreground/40">
            {sys.hostname}
          </div>
        </div>
        <button
          type="button"
          onClick={signOut}
          title="sign out"
          className="grid size-8 place-items-center rounded-lg text-foreground/55 hover:bg-surface-elevated hover:text-foreground"
        >
          <SignOutIcon className="size-4" />
        </button>
        <button
          type="button"
          title="shut down"
          className="grid size-8 place-items-center rounded-lg text-foreground/55 hover:bg-surface-elevated hover:text-foreground"
        >
          <PowerIcon className="size-4" />
        </button>
      </div>

      {/* theme picker */}
      {/* toggle grid */}
      <div className="mb-3 grid grid-cols-2 gap-2">
        <Toggle
          label="Wi-Fi"
          sub={sys.wifiOn ? sys.network : "off"}
          on={sys.wifiOn}
          onClick={sys.toggleWifi}
          icon={<WifiIcon className="size-4" />}
        />
        <Toggle
          label="Bluetooth"
          sub={sys.bluetoothOn ? "on" : "off"}
          on={sys.bluetoothOn}
          onClick={sys.toggleBluetooth}
          icon={<BluetoothIcon className="size-4" />}
        />
        {/* dark mode behaves like every other toggle in the grid: clicking
            flips the resolved theme. the icon swaps between sun and moon so
            users can tell at a glance which mode they're in. */}
        <Toggle
          label="Dark mode"
          sub={isDark ? "on" : "off"}
          on={isDark}
          onClick={toggleTheme}
          icon={
            isDark ? (
              <MoonIcon className="size-4" />
            ) : (
              <SunIcon className="size-4" />
            )
          }
        />
        <Toggle
          label="Do not disturb"
          sub={sys.doNotDisturb ? "on" : "off"}
          on={sys.doNotDisturb}
          onClick={sys.toggleDND}
          icon={
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-4"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M8 12h8" />
            </svg>
          }
        />
      </div>

      {/* sliders */}
      <div className="mb-3 space-y-2">
        <Slider
          value={sys.brightness}
          onChange={sys.setBrightness}
          leadingIcon={<SunIcon className="size-4" />}
        />
        <Slider
          value={sys.volume}
          onChange={sys.setVolume}
          leadingIcon={<VolumeIcon level={sys.volume} className="size-4" />}
        />
      </div>

      {/* battery + settings link */}
      <div className="flex items-center gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-xl border border-border bg-transparent px-3 py-2 text-[11px] text-foreground/65">
          <BatteryIcon level={sys.battery} className="h-3 w-5 text-foreground/80" />
          <span className="tabular-nums text-foreground/85">{sys.battery}%</span>
          <span className="text-foreground/35">·</span>
          <span className="text-foreground/45">
            {sys.charging ? "charging" : "on battery"}
          </span>
        </div>
        <button
          type="button"
          onClick={() => {
            open("settings")
            onClose()
          }}
          title="open settings"
          className="grid size-9 place-items-center rounded-xl border border-border bg-transparent text-foreground/65 hover:bg-surface-elevated hover:text-foreground"
        >
          <GearIcon className="size-4" />
        </button>
      </div>
    </div>
  )
}
