import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"

import {
  CheckIcon,
  LockIcon,
  MoonIcon,
  SunIcon,
  WifiIcon,
} from "@/components/system-icons"
import {
  useAppearance,
  WALLPAPERS,
  type Theme,
  type WallpaperId,
} from "@/state/appearance"
import { useSession } from "@/state/session"
import { useSystem, type WifiNetwork } from "@/state/system"

type SectionId =
  | "appearance"
  | "network"
  | "display"
  | "datetime"
  | "about"

type Section = {
  id: SectionId
  label: string
  icon: React.ReactNode
}

const SECTIONS: Section[] = [
  {
    id: "appearance",
    label: "Appearance",
    icon: <PaletteIcon />,
  },
  { id: "network", label: "Wi-Fi", icon: <WifiIcon className="size-4" /> },
  { id: "display", label: "Display", icon: <SunIcon className="size-4" /> },
  { id: "datetime", label: "Date & Time", icon: <ClockIcon /> },
  { id: "about", label: "About", icon: <InfoIcon /> },
]

function ClockIcon() {
  return (
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
      <path d="M12 7v5l3 2" />
    </svg>
  )
}

function InfoIcon() {
  return (
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
      <path d="M12 8h.01M11 12h1v5h1" />
    </svg>
  )
}

function PaletteIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4"
    >
      <path d="M12 22c-5.5 0-10-4.5-10-10S6.5 2 12 2s10 4 10 9c0 3-2.5 5-5 5h-2c-1.1 0-2 .9-2 2 0 .5.2 1 .5 1.5.4.6.5 1.5-.5 2.5Z" />
      <circle cx="6.5" cy="11.5" r="1" fill="currentColor" />
      <circle cx="9.5" cy="7.5" r="1" fill="currentColor" />
      <circle cx="14.5" cy="7.5" r="1" fill="currentColor" />
      <circle cx="17.5" cy="11.5" r="1" fill="currentColor" />
    </svg>
  )
}

function Switch({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative h-5 w-9 shrink-0 rounded-full border transition",
        on
          ? "border-foreground/30 bg-foreground/85"
          : "border-border bg-surface-elevated"
      )}
      role="switch"
      aria-checked={on}
    >
      <span
        className={cn(
          "absolute top-0.5 size-3.5 rounded-full transition",
          on ? "left-[calc(100%-1rem)] bg-background" : "left-0.5 bg-foreground"
        )}
      />
    </button>
  )
}

function Row({
  label,
  sub,
  trailing,
  className,
}: {
  label: React.ReactNode
  sub?: React.ReactNode
  trailing?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 px-4 py-3",
        className
      )}
    >
      <div className="min-w-0">
        <div className="text-[13px] text-foreground/90">{label}</div>
        {sub && (
          <div className="mt-0.5 truncate text-[11px] text-foreground/45">{sub}</div>
        )}
      </div>
      {trailing}
    </div>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface-elevated backdrop-blur-md">
      {children}
    </div>
  )
}

function Divider() {
  return <div className="border-t border-border" />
}

function NetworkBars({ strength }: { strength: number }) {
  return (
    <div className="flex items-end gap-0.5">
      {[1, 2, 3, 4].map((b) => (
        <span
          key={b}
          className={cn(
            "w-1 rounded-sm transition",
            b <= strength ? "bg-surface-elevated5" : "bg-surface-elevated"
          )}
          style={{ height: `${b * 3 + 2}px` }}
        />
      ))}
    </div>
  )
}

function PageHeader({
  title,
  description,
}: {
  title: string
  description?: string
}) {
  return (
    <div className="border-b border-border px-6 py-4">
      <h2 className="text-base text-foreground">{title}</h2>
      {description && (
        <p className="mt-0.5 text-[12px] text-muted-foreground">{description}</p>
      )}
    </div>
  )
}

// ─── appearance page ──────────────────────────────────────────────────────

function AppearancePage() {
  const { theme, wallpaper, setTheme, setWallpaper } = useAppearance()

  const themeOpts: Array<{ id: Theme; label: string; sub: string }> = [
    { id: "light", label: "Light", sub: "always bright" },
    { id: "dark", label: "Dark", sub: "always dark" },
    { id: "system", label: "System", sub: "follow your OS" },
  ]

  return (
    <>
      <PageHeader
        title="Appearance"
        description="theme, wallpaper, and motion"
      />
      <div className="space-y-4 p-6">
        {/* theme */}
        <div>
          <div className="mb-2 px-1 text-[10px] tracking-widest text-muted-foreground uppercase">
            theme
          </div>
          <div className="grid grid-cols-3 gap-2">
            {themeOpts.map((opt) => {
              const isActive = theme === opt.id
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setTheme(opt.id)}
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-xl border p-4 text-center transition",
                    isActive
                      ? "border-foreground/30 bg-surface-elevated text-foreground"
                      : "border-border bg-transparent text-foreground/60 hover:bg-surface-elevated hover:text-foreground/85"
                  )}
                >
                  <ThemePreview theme={opt.id} />
                  <div>
                    <div className="text-[13px]">{opt.label}</div>
                    <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                      {opt.sub}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* wallpaper */}
        <div>
          <div className="mb-2 px-1 text-[10px] tracking-widest text-muted-foreground uppercase">
            wallpaper
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {WALLPAPERS.map((w) => (
              <WallpaperTile
                key={w.id}
                id={w.id}
                label={w.label}
                description={w.description}
                active={wallpaper === w.id}
                onClick={() => setWallpaper(w.id)}
              />
            ))}
          </div>
        </div>

        {/* misc — placeholder cards for future controls */}
        <Card>
          <Row
            label="Reduce motion"
            sub="ease back on animations"
            trailing={<Switch on={false} onClick={() => {}} />}
          />
          <Divider />
          <Row
            label="Compact mode"
            sub="tighter spacing across the desktop"
            trailing={<Switch on={false} onClick={() => {}} />}
          />
        </Card>
      </div>
    </>
  )
}

// Mini visual preview shown inside each theme tile.
function ThemePreview({ theme }: { theme: Theme }) {
  // We render a static thumbnail per theme. "system" gets a split.
  if (theme === "system") {
    return (
      <div className="relative grid h-16 w-full overflow-hidden rounded-lg border border-border">
        <div className="absolute inset-y-0 left-0 w-1/2 bg-[oklch(0.97_0.004_80)]" />
        <div className="absolute inset-y-0 right-0 w-1/2 bg-[oklch(0.115_0_0)]" />
        <div className="absolute top-1/2 left-1/2 size-6 -translate-x-1/2 -translate-y-1/2 rounded-full border border-border bg-primary" />
      </div>
    )
  }
  const isLight = theme === "light"
  return (
    <div
      className="relative grid h-16 w-full overflow-hidden rounded-lg border border-border"
      style={{
        background: isLight
          ? "linear-gradient(160deg, oklch(0.97 0.004 80) 0%, oklch(0.94 0.008 240) 100%)"
          : "linear-gradient(160deg, oklch(0.13 0.018 260) 0%, oklch(0.16 0.02 250) 100%)",
      }}
    >
      <div className="absolute top-2 right-2 left-2 h-1 rounded-full bg-foreground/20" />
      <div className="absolute right-2 bottom-2 left-2 h-3 rounded bg-foreground/10" />
    </div>
  )
}

function WallpaperTile({
  id,
  label,
  description,
  active,
  onClick,
}: {
  id: WallpaperId
  label: string
  description: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex flex-col items-stretch gap-2 rounded-xl border p-2 text-left transition",
        active
          ? "border-foreground/30 bg-surface-elevated"
          : "border-border bg-transparent hover:bg-surface-elevated"
      )}
    >
      <div className="relative h-16 w-full overflow-hidden rounded-md border border-border">
        <WallpaperThumbnail id={id} />
        {active && (
          <div className="absolute top-1.5 right-1.5 grid size-5 place-items-center rounded-full bg-foreground text-background">
            <CheckIcon className="size-3" />
          </div>
        )}
      </div>
      <div className="px-1">
        <div className="text-[12px] text-foreground">{label}</div>
        <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
          {description}
        </div>
      </div>
    </button>
  )
}

function WallpaperThumbnail({ id }: { id: WallpaperId }) {
  const { resolvedTheme } = useAppearance()
  const isDark = resolvedTheme === "dark"
  switch (id) {
    case "matrix":
      return (
        <div
          className="h-full w-full"
          style={{
            background: isDark
              ? "repeating-linear-gradient(180deg, oklch(0.115 0 0) 0 4px, oklch(0.16 0 0) 4px 5px)"
              : "repeating-linear-gradient(180deg, oklch(0.97 0 0) 0 4px, oklch(0.92 0 0) 4px 5px)",
          }}
        />
      )
    case "aurora":
      return (
        <div
          className="h-full w-full"
          style={{
            background: isDark
              ? "radial-gradient(60% 80% at 30% 20%, oklch(0.32 0.08 50 / 0.7) 0%, transparent 60%), radial-gradient(60% 80% at 80% 60%, oklch(0.26 0.10 260 / 0.7) 0%, transparent 60%), oklch(0.13 0.018 260)"
              : "radial-gradient(60% 80% at 30% 20%, oklch(0.85 0.10 60 / 0.6) 0%, transparent 60%), radial-gradient(60% 80% at 80% 60%, oklch(0.85 0.12 260 / 0.5) 0%, transparent 60%), oklch(0.97 0.008 80)",
          }}
        />
      )
    case "constellation":
      return (
        <div
          className="h-full w-full"
          style={{
            backgroundColor: isDark ? "oklch(0.115 0 0)" : "oklch(0.97 0.004 80)",
            backgroundImage: isDark
              ? "radial-gradient(oklch(1 0 0 / 0.3) 1px, transparent 1px)"
              : "radial-gradient(oklch(0 0 0 / 0.25) 1px, transparent 1px)",
            backgroundSize: "8px 8px",
          }}
        />
      )
    case "solid":
      return (
        <div
          className="h-full w-full"
          style={{
            background: isDark
              ? "radial-gradient(120% 90% at 50% 0%, oklch(0.18 0.02 260) 0%, oklch(0.115 0 0) 70%)"
              : "radial-gradient(120% 90% at 50% 0%, oklch(0.98 0.012 70) 0%, oklch(0.94 0.008 240) 70%)",
          }}
        />
      )
  }
}

function NetworkPage() {
  const sys = useSystem()
  return (
    <>
      <PageHeader
        title="Wi-Fi"
        description="manage your wireless connections and known networks"
      />
      <div className="space-y-4 p-6">
        <Card>
          <Row
            label="Wi-Fi"
            sub={sys.wifiOn ? `connected to ${sys.network}` : "off"}
            trailing={<Switch on={sys.wifiOn} onClick={sys.toggleWifi} />}
          />
        </Card>

        {sys.wifiOn && (
          <div>
            <div className="mb-2 px-1 text-[10px] tracking-widest text-foreground/35 uppercase">
              networks
            </div>
            <Card>
              {sys.knownNetworks.map((n: WifiNetwork, i) => {
                const active = n.ssid === sys.network
                return (
                  <React.Fragment key={n.ssid}>
                    {i > 0 && <Divider />}
                    <button
                      type="button"
                      onClick={() => sys.selectNetwork(n.ssid)}
                      className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-surface-elevated"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <NetworkBars strength={n.strength} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 text-[13px] text-foreground/90">
                            <span className="truncate">{n.ssid}</span>
                            {n.secured && (
                              <LockIcon className="size-3 text-foreground/35" />
                            )}
                          </div>
                          <div className="text-[10px] text-foreground/35">
                            802.11ac · {n.strength * 25}%
                          </div>
                        </div>
                      </div>
                      {active && <CheckIcon className="size-4 text-foreground" />}
                    </button>
                  </React.Fragment>
                )
              })}
            </Card>
          </div>
        )}
      </div>
    </>
  )
}

function DisplayPage() {
  const sys = useSystem()
  return (
    <>
      <PageHeader title="Display" description="brightness, scale and appearance" />
      <div className="space-y-4 p-6">
        <Card>
          <div className="px-4 py-4">
            <div className="flex items-center justify-between text-[13px] text-foreground/90">
              <span>Brightness</span>
              <span className="font-mono text-[11px] tabular-nums text-foreground/55">
                {sys.brightness}%
              </span>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <SunIcon className="size-4 text-foreground/45" />
              <input
                type="range"
                min={0}
                max={100}
                value={sys.brightness}
                onChange={(e) => sys.setBrightness(Number(e.target.value))}
                className="slider-track flex-1"
              />
              <SunIcon className="size-5 text-foreground/85" />
            </div>
          </div>
          <Divider />
          <Row
            label="Auto-adjust brightness"
            sub="match ambient light when available"
            trailing={<Switch on={true} onClick={() => {}} />}
          />
        </Card>

        <Card>
          <Row
            label="Appearance"
            sub="dark mode (always on)"
            trailing={
              <div className="flex items-center gap-2 rounded-md border border-border bg-surface-elevated p-1">
                <button className="grid size-7 place-items-center rounded text-foreground/40">
                  <SunIcon className="size-3.5" />
                </button>
                <button className="grid size-7 place-items-center rounded bg-surface-elevated text-foreground">
                  <MoonIcon className="size-3.5" />
                </button>
              </div>
            }
          />
          <Divider />
          <Row
            label="Resolution"
            sub="2560 × 1600 (Retina)"
            trailing={
              <span className="font-mono text-[11px] text-foreground/45">native</span>
            }
          />
          <Divider />
          <Row
            label="Refresh rate"
            sub="ProMotion adaptive"
            trailing={
              <span className="font-mono text-[11px] text-foreground/45">120 Hz</span>
            }
          />
        </Card>
      </div>
    </>
  )
}

function DateTimePage() {
  const [now, setNow] = React.useState(() => new Date())
  React.useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])
  return (
    <>
      <PageHeader title="Date & Time" />
      <div className="space-y-4 p-6">
        <Card>
          <div className="px-4 py-5 text-center">
            <div className="font-display text-5xl text-foregroundtabular-nums">
              {now.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </div>
            <div className="mt-1 text-[12px] text-foreground/55">
              {now.toLocaleDateString(undefined, {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </div>
          </div>
        </Card>
        <Card>
          <Row
            label="Set automatically"
            sub="using network time"
            trailing={<Switch on={true} onClick={() => {}} />}
          />
          <Divider />
          <Row
            label="Time zone"
            sub="auto-detect"
            trailing={
              <span className="font-mono text-[11px] text-foreground/45">
                {Intl.DateTimeFormat().resolvedOptions().timeZone}
              </span>
            }
          />
          <Divider />
          <Row
            label="24-hour clock"
            trailing={<Switch on={true} onClick={() => {}} />}
          />
        </Card>
      </div>
    </>
  )
}

function AboutPage() {
  const sys = useSystem()
  const { user } = useSession()
  const items = [
    ["Hostname", sys.hostname],
    ["User", user?.name ?? "guest"],
    ["OS", "dockerlab 0.1.0"],
    ["Kernel", "linux 6.6.14"],
    ["Architecture", "x86_64"],
    ["Memory", "16 GB"],
    ["Storage", "512 GB SSD · 187 GB free"],
    ["Docker", "27.0.3 (build 7d4bcd863a)"],
  ]
  return (
    <>
      <PageHeader title="About this computer" />
      <div className="space-y-4 p-6">
        <Card>
          <div className="flex items-center gap-4 px-4 py-5">
            <div className="grid size-14 place-items-center rounded-2xl border border-border bg-gradient-to-br from-foreground/15 to-foreground/5">
              <span className="font-display text-xl text-foreground">∎</span>
            </div>
            <div>
              <div className="font-display text-lg text-foreground">{sys.hostname}</div>
              <div className="text-[11px] text-foreground/45">
                dockerlab edition · educational
              </div>
            </div>
          </div>
        </Card>
        <Card>
          {items.map(([k, v], i) => (
            <React.Fragment key={k}>
              {i > 0 && <Divider />}
              <Row
                label={k}
                trailing={
                  <span className="font-mono text-[11px] text-foreground/65">
                    {v}
                  </span>
                }
              />
            </React.Fragment>
          ))}
        </Card>
      </div>
    </>
  )
}

const PAGES: Record<SectionId, React.ComponentType> = {
  appearance: AppearancePage,
  network: NetworkPage,
  display: DisplayPage,
  datetime: DateTimePage,
  about: AboutPage,
}

export function SettingsApp() {
  const [active, setActive] = React.useState<SectionId>("appearance")
  const Page = PAGES[active]

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[200px_1fr]">
      {/* sidebar */}
      <div className="flex min-h-0 flex-col border-r border-border bg-surface-sunken">
        <div className="border-b border-border px-4 py-3">
          <div className="text-[10px] tracking-widest text-foreground/35 uppercase">
            settings
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {SECTIONS.map((s) => {
            const isActive = s.id === active
            return (
              <PlainPlease key={s.id}>
                <button
                  type="button"
                  onClick={() => setActive(s.id)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12px] transition",
                    isActive
                      ? "bg-surface-elevated text-foreground"
                      : "text-foreground/60 hover:bg-surface-elevated hover:text-foreground/85"
                  )}
                >
                  <span
                    className={cn(
                      "grid size-6 place-items-center rounded-md transition",
                      isActive ? "bg-surface-elevated text-foreground" : "text-foreground/50"
                    )}
                  >
                    {s.icon}
                  </span>
                  <span className="flex-1">{s.label}</span>
                </button>
              </PlainPlease>
            )
          })}
        </div>
      </div>

      {/* content */}
      <div className="min-h-0 overflow-y-auto">
        <Page />
      </div>
    </div>
  )
}

// little wrapper to avoid React key warnings on Fragment-style mapping
function PlainPlease({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
