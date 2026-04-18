/* eslint-disable react-refresh/only-export-components */
import * as React from "react"

import { useAppearance } from "@/state/appearance"
import { type AppId } from "@/state/windows"

const SVG_PROPS = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
}

// Each app icon uses a SOLID opaque background with a per-app hue. No
// transparent tints over a shared base — that produced invisible tiles on
// dark backgrounds. Dark and light variants are completely separate colors.

type IconStyle = {
  /** solid background gradient in dark mode */
  darkBg: string
  /** solid background gradient in light mode */
  lightBg: string
  /** glyph stroke color in dark mode */
  darkStroke: string
  /** glyph stroke color in light mode */
  lightStroke: string
  icon: React.ReactNode
}

const APP_ICONS: Record<AppId, IconStyle> = {
  welcome: {
    darkBg: "linear-gradient(135deg, oklch(0.38 0.08 80) 0%, oklch(0.30 0.10 70) 100%)",
    lightBg: "linear-gradient(135deg, oklch(0.95 0.04 80) 0%, oklch(0.88 0.08 70) 100%)",
    darkStroke: "oklch(0.88 0.06 80)",
    lightStroke: "oklch(0.42 0.15 60)",
    icon: (
      <svg {...SVG_PROPS}>
        <path d="M12 2 4 6v6c0 5 3.5 9 8 10 4.5-1 8-5 8-10V6l-8-4Z" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    ),
  },
  files: {
    darkBg: "linear-gradient(135deg, oklch(0.35 0.10 240) 0%, oklch(0.28 0.12 250) 100%)",
    lightBg: "linear-gradient(135deg, oklch(0.92 0.06 240) 0%, oklch(0.85 0.10 250) 100%)",
    darkStroke: "oklch(0.85 0.06 235)",
    lightStroke: "oklch(0.38 0.16 245)",
    icon: (
      <svg {...SVG_PROPS}>
        <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
        <path d="M3 10h18" />
      </svg>
    ),
  },
  terminal: {
    darkBg: "linear-gradient(135deg, oklch(0.30 0.06 150) 0%, oklch(0.24 0.08 160) 100%)",
    lightBg: "linear-gradient(135deg, oklch(0.92 0.06 150) 0%, oklch(0.85 0.08 160) 100%)",
    darkStroke: "oklch(0.88 0.06 145)",
    lightStroke: "oklch(0.38 0.16 150)",
    icon: (
      <svg {...SVG_PROPS} strokeWidth={2}>
        <path d="m6 8 4 4-4 4M14 16h4" />
      </svg>
    ),
  },
  containers: {
    darkBg: "linear-gradient(135deg, oklch(0.32 0.08 185) 0%, oklch(0.26 0.10 195) 100%)",
    lightBg: "linear-gradient(135deg, oklch(0.92 0.06 180) 0%, oklch(0.85 0.08 190) 100%)",
    darkStroke: "oklch(0.85 0.06 180)",
    lightStroke: "oklch(0.38 0.14 180)",
    icon: (
      <svg {...SVG_PROPS}>
        <path d="M3 7v10l9 4 9-4V7l-9-4-9 4Z" />
        <path d="m3 7 9 4 9-4M12 11v10" />
      </svg>
    ),
  },
  browser: {
    darkBg: "linear-gradient(135deg, oklch(0.33 0.10 255) 0%, oklch(0.26 0.12 265) 100%)",
    lightBg: "linear-gradient(135deg, oklch(0.92 0.06 250) 0%, oklch(0.85 0.10 260) 100%)",
    darkStroke: "oklch(0.85 0.06 250)",
    lightStroke: "oklch(0.4 0.16 250)",
    icon: (
      <svg {...SVG_PROPS}>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
      </svg>
    ),
  },
  settings: {
    darkBg: "linear-gradient(135deg, oklch(0.30 0.015 260) 0%, oklch(0.25 0.015 260) 100%)",
    lightBg: "linear-gradient(135deg, oklch(0.94 0.01 260) 0%, oklch(0.88 0.01 260) 100%)",
    darkStroke: "oklch(0.82 0.01 260)",
    lightStroke: "oklch(0.32 0 0)",
    icon: (
      <svg {...SVG_PROPS}>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
      </svg>
    ),
  },
  code: {
    darkBg: "linear-gradient(135deg, oklch(0.34 0.12 240) 0%, oklch(0.27 0.14 250) 100%)",
    lightBg: "linear-gradient(135deg, oklch(0.90 0.08 240) 0%, oklch(0.84 0.12 250) 100%)",
    darkStroke: "oklch(0.82 0.08 235)",
    lightStroke: "oklch(0.4 0.18 240)",
    icon: (
      <svg {...SVG_PROPS}>
        <path d="m16 18 6-6-6-6M8 6l-6 6 6 6" />
      </svg>
    ),
  },
}

export const APP_LABELS: Record<AppId, string> = {
  welcome: "welcome",
  files: "files",
  terminal: "terminal",
  containers: "containers",
  browser: "browser",
  settings: "settings",
  code: "code",
}

type AppIconProps = {
  app: AppId
  size?: number
}

export function AppIcon({ app, size = 48 }: AppIconProps) {
  const style = APP_ICONS[app]
  const { resolvedTheme } = useAppearance()
  const isDark = resolvedTheme === "dark"
  const iconSize = Math.round(size * 0.55)

  const bg = isDark ? style.darkBg : style.lightBg
  const stroke = isDark ? style.darkStroke : style.lightStroke
  const borderColor = isDark ? "oklch(1 0 0 / 0.14)" : "oklch(0 0 0 / 0.10)"
  const innerShadow = isDark
    ? "inset 0 1px 0 oklch(1 0 0 / 0.12), inset 0 -1px 0 oklch(0 0 0 / 0.3)"
    : "inset 0 1px 0 oklch(1 0 0 / 0.7), inset 0 -1px 0 oklch(0 0 0 / 0.06)"
  const dropShadow = isDark
    ? "0 4px 14px -6px oklch(0 0 0 / 0.5)"
    : "0 6px 16px -8px oklch(0 0 0 / 0.18)"

  return (
    <div
      className="grid shrink-0 place-items-center rounded-2xl border"
      style={{
        width: size,
        height: size,
        borderColor,
        background: bg,
        boxShadow: `${dropShadow}, ${innerShadow}`,
        color: stroke,
      }}
    >
      <span
        className="grid place-items-center"
        style={{ width: iconSize, height: iconSize }}
      >
        {style.icon}
      </span>
    </div>
  )
}
