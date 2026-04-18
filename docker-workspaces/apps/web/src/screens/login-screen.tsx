import * as React from "react"

import { Wallpaper } from "@/components/wallpaper"
import {
  ArrowRightIcon,
  BatteryIcon,
  CloseDot,
  PowerIcon,
  SignOutIcon,
  WifiIcon,
} from "@/components/system-icons"
import { useSession } from "@/state/session"
import { useSystem } from "@/state/system"

function useClock() {
  const [now, setNow] = React.useState(() => new Date())
  React.useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 15_000)
    return () => window.clearInterval(id)
  }, [])
  return now
}

function relativeFrom(ms: number) {
  const diff = Date.now() - ms
  const m = Math.floor(diff / 60_000)
  if (m < 1) return "just now"
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

function avatarTone(name: string) {
  // deterministic neutral tint per name
  let hash = 0
  for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) | 0
  const hue = Math.abs(hash) % 360
  // very low chroma so it stays mono
  return `oklch(0.32 0.04 ${hue})`
}

export function LoginScreen() {
  const { signIn, knownUsers, forgetUser } = useSession()
  const sys = useSystem()
  const [name, setName] = React.useState("")
  const [showAdd, setShowAdd] = React.useState(knownUsers.length === 0)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const now = useClock()

  React.useEffect(() => {
    if (showAdd) inputRef.current?.focus()
  }, [showAdd])

  const time = now.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })
  const date = now
    .toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
    })
    .toLowerCase()

  function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!name.trim()) return
    signIn(name)
  }

  return (
    <div className="relative h-full w-full">
      <Wallpaper blur />

      {/* corner brand */}
      <div className="absolute top-5 left-6 flex items-center gap-2 font-mono text-[11px] text-foreground/55">
        <span className="size-1.5 rounded-full bg-primary/80" />
        <span className="font-semibold tracking-wide text-foreground/80">
          dockerlab
        </span>
        <span className="text-foreground/25">/</span>
        <span>session 04</span>
      </div>

      {/* corner clock */}
      <div className="absolute top-5 right-6 text-right">
        <div className="font-display text-xl text-foreground tabular-nums">
          {time}
        </div>
        <div className="font-mono text-[10px] text-foreground/45">{date}</div>
      </div>

      {/* center stack */}
      <div className="fade-in relative grid h-full place-items-center px-6">
        <div className="flex w-full max-w-md flex-col items-center gap-7">
          {/* tagline */}
          <div className="text-center">
            <h1 className="font-display text-2xl text-foreground sm:text-[1.7rem]">
              Welcome back.
            </h1>
            <p className="mt-1 text-xs text-foreground/45">
              pick your workspace or create a new one
            </p>
          </div>

          {/* known user grid */}
          {!showAdd && knownUsers.length > 0 && (
            <div className="grid w-full grid-cols-3 gap-3">
              {knownUsers.map((u) => (
                <button
                  key={u.name}
                  type="button"
                  onClick={() => signIn(u.name)}
                  className="group relative flex flex-col items-center gap-2 rounded-2xl border border-border bg-surface-elevated p-4 text-center backdrop-blur-md transition hover:border-foreground/20 hover:bg-surface-elevated"
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      forgetUser(u.name)
                    }}
                    className="absolute top-1.5 right-1.5 grid size-5 place-items-center rounded-full text-foreground/30 opacity-0 transition group-hover:opacity-100 hover:bg-surface-elevated hover:text-foreground/80"
                    aria-label={`forget ${u.name}`}
                  >
                    <CloseDot className="size-3" />
                  </button>

                  <div
                    className="grid size-14 place-items-center rounded-full border border-border text-lg font-medium text-foreground shadow-[0_4px_18px_-6px_rgba(0,0,0,0.7)]"
                    style={{
                      backgroundColor: avatarTone(u.name),
                    }}
                  >
                    {u.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-[13px] text-foreground/90">
                      {u.name}
                    </div>
                    <div className="font-mono text-[10px] text-foreground/40">
                      {relativeFrom(u.loginAt)}
                    </div>
                  </div>
                </button>
              ))}

              {/* add new user tile */}
              <button
                type="button"
                onClick={() => setShowAdd(true)}
                className="group flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-transparent p-4 text-center backdrop-blur-md transition hover:border-foreground/30 hover:bg-surface-elevated"
              >
                <div className="grid size-14 place-items-center rounded-full border border-border bg-surface-elevated text-2xl text-foreground/55 group-hover:text-foreground">
                  +
                </div>
                <div className="text-[11px] text-foreground/45 group-hover:text-foreground/75">
                  add user
                </div>
              </button>
            </div>
          )}

          {/* add user form */}
          {showAdd && (
            <form
              onSubmit={onSubmit}
              className="flex w-full max-w-xs flex-col items-center gap-4"
            >
              <div className="grid size-20 place-items-center rounded-full border border-border bg-surface-elevated text-2xl text-foreground/85 shadow-[0_8px_30px_-8px_rgba(0,0,0,0.7)] backdrop-blur-md">
                <span className="font-display">
                  {name.trim().charAt(0).toUpperCase() || (
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      className="size-7 text-foreground/45"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="12" cy="9" r="3.5" />
                      <path d="M5 20a7 7 0 0 1 14 0" />
                    </svg>
                  )}
                </span>
              </div>

              <div className="relative w-full">
                <input
                  ref={inputRef}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="username"
                  spellCheck={false}
                  autoComplete="off"
                  className="h-10 w-full rounded-full border border-border bg-surface-elevated pr-12 pl-5 text-sm text-foreground placeholder:text-foreground/35 outline-none backdrop-blur-md transition focus:border-foreground/30 focus:bg-surface-elevated"
                />
                <button
                  type="submit"
                  disabled={!name.trim()}
                  aria-label="sign in"
                  className="absolute top-1/2 right-1 grid size-8 -translate-y-1/2 place-items-center rounded-full bg-surface-elevated text-foreground transition enabled:hover:bg-foreground/20 disabled:opacity-30"
                >
                  <ArrowRightIcon className="size-4" />
                </button>
              </div>

              {knownUsers.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setShowAdd(false)
                    setName("")
                  }}
                  className="text-[11px] text-foreground/40 hover:text-foreground/70"
                >
                  ← back to users
                </button>
              )}
            </form>
          )}
        </div>
      </div>

      {/* bottom system bar */}
      <div className="absolute right-0 bottom-0 left-0 flex items-end justify-between px-5 pb-4">
        {/* left actions */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="flex items-center gap-2 rounded-lg border border-border bg-surface-elevated px-3 py-2 text-[12px] text-foreground/75 backdrop-blur-md transition hover:border-foreground/20 hover:bg-surface-elevated hover:text-foreground"
          >
            <PowerIcon className="size-4" />
            <span>shut down</span>
          </button>
          <button
            type="button"
            className="flex items-center gap-2 rounded-lg border border-border bg-surface-elevated px-3 py-2 text-[12px] text-foreground/75 backdrop-blur-md transition hover:border-foreground/20 hover:bg-surface-elevated hover:text-foreground"
          >
            <SignOutIcon className="size-4" />
            <span>sign out</span>
          </button>
        </div>

        {/* right tray */}
        <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-elevated px-3 py-2 backdrop-blur-md">
          <div className="flex items-center gap-1.5 text-foreground/75">
            <WifiIcon className="size-4" />
            <span className="font-mono text-[10px] text-foreground/55">
              {sys.network}
            </span>
          </div>
          <div className="h-4 w-px bg-surface-elevated" />
          <div className="flex items-center gap-1.5 text-foreground/75">
            <BatteryIcon level={sys.battery} className="h-3.5 w-6" />
            <span className="font-mono text-[10px] tabular-nums text-foreground/55">
              {sys.battery}%
            </span>
          </div>
          <div className="h-4 w-px bg-surface-elevated" />
          <span className="font-mono text-[11px] tabular-nums text-foreground/80">
            {time}
          </span>
        </div>
      </div>
    </div>
  )
}
