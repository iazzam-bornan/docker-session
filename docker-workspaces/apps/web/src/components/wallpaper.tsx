import { MatrixRain } from "@/components/matrix-rain"
import {
  AuroraKeyframes,
  AuroraWallpaper,
  ConstellationWallpaper,
  SolidWallpaper,
} from "@/components/wallpapers"
import { useAppearance } from "@/state/appearance"

type WallpaperProps = {
  /** Slightly softens the wallpaper for the login screen. */
  blur?: boolean
}

// ─────────────────────────────────────────────────────────────────────────
// wallpaper — a thin dispatcher around the four wallpaper components.
//
// the active wallpaper id lives in appearance state. each wallpaper is
// fully self-contained and reads `resolvedTheme` itself, so this file
// only has to pick which one to mount.
// ─────────────────────────────────────────────────────────────────────────

export function Wallpaper({ blur = false }: WallpaperProps) {
  const { wallpaper, resolvedTheme } = useAppearance()

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden bg-background"
    >
      {/* keyframes for the aurora wallpaper — cheap to keep registered */}
      <AuroraKeyframes />

      <div
        className="absolute inset-0"
        style={{
          filter: blur ? "blur(6px) saturate(85%)" : "none",
          transform: blur ? "scale(1.04)" : "none",
        }}
      >
        {wallpaper === "matrix" && (
          <div className="relative h-full w-full" style={{ opacity: blur ? 0.85 : 0.65 }}>
            <MatrixRain
              intensity={blur ? 0.05 : 0.06}
              cellSize={blur ? 17 : 16}
              fps={blur ? 16 : 18}
            />
          </div>
        )}
        {wallpaper === "aurora" && <AuroraWallpaper />}
        {wallpaper === "constellation" && <ConstellationWallpaper />}
        {wallpaper === "solid" && <SolidWallpaper />}
      </div>

      {/* shared center wash for matrix only — the other wallpapers ship
          with their own readability handling */}
      {wallpaper === "matrix" && (
        <div
          className="absolute inset-0"
          style={{
            background:
              resolvedTheme === "dark"
                ? "radial-gradient(70% 60% at 50% 45%, oklch(0.115 0 0 / 0.45) 0%, oklch(0.115 0 0 / 0.65) 70%, oklch(0.10 0 0 / 0.78) 100%)"
                : "radial-gradient(70% 60% at 50% 45%, oklch(0.97 0 0 / 0.4) 0%, oklch(0.95 0.005 250 / 0.7) 100%)",
          }}
        />
      )}
    </div>
  )
}
