/* eslint-disable react-refresh/only-export-components */
import * as React from "react"

// ─────────────────────────────────────────────────────────────────────────
// appearance state
//
// owns: theme (light / dark / system) and wallpaper choice. persisted to
// localStorage so a sign-out doesn't reset the user's preferences.
//
// applying the theme works by toggling `dark` / `light` classes on
// document.documentElement. globals.css uses `:root` for light and
// `.dark` for dark, so the right cascade kicks in automatically.
// ─────────────────────────────────────────────────────────────────────────

export type Theme = "light" | "dark" | "system"
export type ResolvedTheme = "light" | "dark"

export type WallpaperId = "matrix" | "aurora" | "constellation" | "solid"

export const WALLPAPERS: Array<{
  id: WallpaperId
  label: string
  description: string
}> = [
  { id: "matrix", label: "Matrix", description: "raining glyphs" },
  { id: "aurora", label: "Aurora", description: "drifting blobs" },
  { id: "constellation", label: "Constellation", description: "quiet dot grid" },
  { id: "solid", label: "Solid", description: "just a gradient" },
]

type AppearanceState = {
  theme: Theme
  resolvedTheme: ResolvedTheme
  wallpaper: WallpaperId
}

type AppearanceContextValue = AppearanceState & {
  setTheme: (theme: Theme) => void
  setWallpaper: (wallpaper: WallpaperId) => void
  /** convenience: cycle dark → light (used by the quick-settings sun/moon) */
  toggleTheme: () => void
}

const AppearanceContext = React.createContext<
  AppearanceContextValue | undefined
>(undefined)

const STORAGE_THEME = "dockerlab.theme.v1"
const STORAGE_WALLPAPER = "dockerlab.wallpaper.v1"

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "dark"
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light"
}

function readTheme(): Theme {
  try {
    const v = localStorage.getItem(STORAGE_THEME)
    if (v === "light" || v === "dark" || v === "system") return v
  } catch {
    /* ignore */
  }
  return "dark"
}

function readWallpaper(): WallpaperId {
  try {
    const v = localStorage.getItem(STORAGE_WALLPAPER)
    if (v === "matrix" || v === "aurora" || v === "constellation" || v === "solid") {
      return v
    }
  } catch {
    /* ignore */
  }
  return "matrix"
}

function applyTheme(resolved: ResolvedTheme): void {
  const root = document.documentElement
  root.classList.remove("light", "dark")
  root.classList.add(resolved)
}

/**
 * Read the persisted theme without mounting React. Called from main.tsx
 * BEFORE the first render so the page never flashes the wrong theme.
 */
export function bootstrapAppearance(): void {
  if (typeof window === "undefined") return
  const theme = readTheme()
  const resolved = theme === "system" ? getSystemTheme() : theme
  applyTheme(resolved)
}

export function AppearanceProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [theme, setThemeState] = React.useState<Theme>(() => readTheme())
  const [wallpaper, setWallpaperState] = React.useState<WallpaperId>(() =>
    readWallpaper()
  )
  const [resolvedTheme, setResolvedTheme] = React.useState<ResolvedTheme>(
    () => (readTheme() === "system" ? getSystemTheme() : (readTheme() as ResolvedTheme))
  )

  // Apply + persist theme whenever it changes.
  React.useEffect(() => {
    const resolved = theme === "system" ? getSystemTheme() : theme
    setResolvedTheme(resolved)
    applyTheme(resolved)
    try {
      localStorage.setItem(STORAGE_THEME, theme)
    } catch {
      /* ignore */
    }
  }, [theme])

  // When following system, listen for OS preference changes.
  React.useEffect(() => {
    if (theme !== "system") return
    const mql = window.matchMedia("(prefers-color-scheme: dark)")
    const onChange = () => {
      const next: ResolvedTheme = mql.matches ? "dark" : "light"
      setResolvedTheme(next)
      applyTheme(next)
    }
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [theme])

  // Persist wallpaper.
  React.useEffect(() => {
    try {
      localStorage.setItem(STORAGE_WALLPAPER, wallpaper)
    } catch {
      /* ignore */
    }
  }, [wallpaper])

  const setTheme = React.useCallback((next: Theme) => {
    setThemeState(next)
  }, [])

  const setWallpaper = React.useCallback((next: WallpaperId) => {
    setWallpaperState(next)
  }, [])

  const toggleTheme = React.useCallback(() => {
    setThemeState((t) => {
      // when on "system", toggle resolves to the *opposite* of what's currently shown
      if (t === "system") return getSystemTheme() === "dark" ? "light" : "dark"
      return t === "dark" ? "light" : "dark"
    })
  }, [])

  const value = React.useMemo<AppearanceContextValue>(
    () => ({
      theme,
      resolvedTheme,
      wallpaper,
      setTheme,
      setWallpaper,
      toggleTheme,
    }),
    [theme, resolvedTheme, wallpaper, setTheme, setWallpaper, toggleTheme]
  )

  return (
    <AppearanceContext.Provider value={value}>
      {children}
    </AppearanceContext.Provider>
  )
}

export function useAppearance(): AppearanceContextValue {
  const ctx = React.useContext(AppearanceContext)
  if (!ctx) throw new Error("useAppearance must be used within AppearanceProvider")
  return ctx
}
