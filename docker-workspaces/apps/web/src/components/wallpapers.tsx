import * as React from "react"

import { useAppearance } from "@/state/appearance"

// ─────────────────────────────────────────────────────────────────────────
// wallpapers
//
// each wallpaper is a self-contained absolute-positioned background. they
// all read `resolvedTheme` from appearance state so colors flip cleanly
// when the user toggles light/dark.
//
// add a new wallpaper:
//   1. add a component below
//   2. wire it into the dispatcher in wallpaper.tsx
//   3. add an entry to WALLPAPERS in state/appearance.tsx
// ─────────────────────────────────────────────────────────────────────────

// ─── aurora ──────────────────────────────────────────────────────────────
// drifting blurred blobs. cheap, smooth, looks great in both modes.

export function AuroraWallpaper() {
  const { resolvedTheme } = useAppearance()
  const colors =
    resolvedTheme === "dark"
      ? {
          base: "linear-gradient(160deg, oklch(0.13 0.018 260) 0%, oklch(0.16 0.02 250) 100%)",
          blob1: "oklch(0.32 0.08 50 / 0.55)",
          blob2: "oklch(0.26 0.10 260 / 0.55)",
          blob3: "oklch(0.30 0.06 200 / 0.45)",
        }
      : {
          base: "linear-gradient(160deg, oklch(0.97 0.008 80) 0%, oklch(0.94 0.01 230) 100%)",
          blob1: "oklch(0.85 0.10 60 / 0.55)",
          blob2: "oklch(0.85 0.12 260 / 0.45)",
          blob3: "oklch(0.88 0.08 200 / 0.55)",
        }

  return (
    <div
      aria-hidden
      className="absolute inset-0 overflow-hidden"
      style={{ background: colors.base }}
    >
      <div
        className="absolute -top-1/4 -left-1/4 h-[120%] w-[80%] rounded-full blur-[140px] aurora-drift-1"
        style={{ background: `radial-gradient(circle, ${colors.blob1} 0%, transparent 60%)` }}
      />
      <div
        className="absolute -right-1/4 top-1/3 h-[100%] w-[70%] rounded-full blur-[140px] aurora-drift-2"
        style={{ background: `radial-gradient(circle, ${colors.blob2} 0%, transparent 60%)` }}
      />
      <div
        className="absolute bottom-[-20%] left-1/4 h-[80%] w-[60%] rounded-full blur-[140px] aurora-drift-3"
        style={{ background: `radial-gradient(circle, ${colors.blob3} 0%, transparent 60%)` }}
      />
    </div>
  )
}

// ─── constellation ───────────────────────────────────────────────────────
// quiet 32px dot grid. survives both themes by adjusting the dot color.

export function ConstellationWallpaper() {
  const { resolvedTheme } = useAppearance()
  const isDark = resolvedTheme === "dark"
  return (
    <div
      aria-hidden
      className="absolute inset-0 overflow-hidden"
      style={{
        background: isDark
          ? "linear-gradient(160deg, oklch(0.115 0 0) 0%, oklch(0.14 0.01 250) 100%)"
          : "linear-gradient(160deg, oklch(0.97 0.004 80) 0%, oklch(0.95 0.005 250) 100%)",
      }}
    >
      <svg
        className="absolute inset-0 h-full w-full"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern
            id="constellation-dots"
            x="0"
            y="0"
            width="32"
            height="32"
            patternUnits="userSpaceOnUse"
          >
            <circle
              cx="2"
              cy="2"
              r="1.2"
              fill={isDark ? "oklch(1 0 0 / 0.16)" : "oklch(0 0 0 / 0.18)"}
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#constellation-dots)" />
      </svg>
      {/* center wash so foreground content is readable */}
      <div
        className="absolute inset-0"
        style={{
          background: isDark
            ? "radial-gradient(70% 60% at 50% 45%, oklch(0.115 0 0 / 0.5) 0%, oklch(0.115 0 0 / 0.85) 100%)"
            : "radial-gradient(70% 60% at 50% 45%, oklch(0.97 0 0 / 0.4) 0%, oklch(0.95 0.005 250 / 0.7) 100%)",
        }}
      />
    </div>
  )
}

// ─── solid ──────────────────────────────────────────────────────────────
// just a soft gradient. minimal, fast, focused.

export function SolidWallpaper() {
  const { resolvedTheme } = useAppearance()
  return (
    <div
      aria-hidden
      className="absolute inset-0"
      style={{
        background:
          resolvedTheme === "dark"
            ? "radial-gradient(120% 90% at 50% 0%, oklch(0.18 0.02 260) 0%, oklch(0.115 0 0) 70%)"
            : "radial-gradient(120% 90% at 50% 0%, oklch(0.98 0.012 70) 0%, oklch(0.94 0.008 240) 70%)",
      }}
    />
  )
}

// shared keyframes for the aurora drift — registered once, reused on each blob
// (with different durations and delays for parallax)
export const AuroraKeyframes = () => (
  <style>{`
    @keyframes aurora-drift-1 {
      0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
      50% { transform: translate3d(8%, -6%, 0) scale(1.06); }
    }
    @keyframes aurora-drift-2 {
      0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
      50% { transform: translate3d(-10%, 8%, 0) scale(1.04); }
    }
    @keyframes aurora-drift-3 {
      0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
      50% { transform: translate3d(6%, -4%, 0) scale(1.08); }
    }
    .aurora-drift-1 { animation: aurora-drift-1 22s ease-in-out infinite; }
    .aurora-drift-2 { animation: aurora-drift-2 28s ease-in-out infinite; }
    .aurora-drift-3 { animation: aurora-drift-3 26s ease-in-out infinite; }
  `}</style>
)

void React // tree-shake guard for the keyframes block
