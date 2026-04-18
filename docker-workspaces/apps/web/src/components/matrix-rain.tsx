import * as React from "react"

import { useAppearance } from "@/state/appearance"

type MatrixRainProps = {
  /** Base opacity for trails. Lower = more dramatic, higher = subtler. */
  intensity?: number
  /** Pixel size of each char cell. */
  cellSize?: number
  /** Approx target frames per second. */
  fps?: number
}

const GLYPHS =
  "ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789{}[]()<>=+-*/$#@&_:;.,abcdefABCDEF"

const glyphArr = Array.from(GLYPHS)

function pickGlyph() {
  return glyphArr[Math.floor(Math.random() * glyphArr.length)]
}

export function MatrixRain({
  intensity = 0.07,
  cellSize = 16,
  fps = 18,
}: MatrixRainProps) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const { resolvedTheme } = useAppearance()

  React.useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d", { alpha: true })
    if (!ctx) return

    // theme-aware palette: in dark mode we paint light glyphs on a dark
    // wash; in light mode we paint dark glyphs on a light wash. the
    // "fade" rectangle is what produces the trailing tail by overdrawing
    // the previous frame each tick.
    const palette =
      resolvedTheme === "dark"
        ? {
            fade: `oklch(0.115 0 0 / ${intensity})`,
            tail: "oklch(0.78 0 0 / 0.55)",
            leader: "oklch(0.96 0.05 95 / 0.95)",
          }
        : {
            fade: `oklch(0.97 0 0 / ${intensity})`,
            tail: "oklch(0.4 0 0 / 0.45)",
            leader: "oklch(0.18 0.03 70 / 0.85)",
          }

    let columns = 0
    let drops: number[] = []
    let dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1))

    const resize = () => {
      const parent = canvas.parentElement
      if (!parent) return
      dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1))
      const w = parent.clientWidth
      const h = parent.clientHeight
      canvas.width = Math.floor(w * dpr)
      canvas.height = Math.floor(h * dpr)
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.font = `${cellSize - 2}px "JetBrains Mono", ui-monospace, monospace`
      ctx.textBaseline = "top"

      columns = Math.ceil(w / cellSize)
      drops = new Array(columns).fill(0).map(() =>
        // start at random row so it looks alive immediately
        Math.floor((Math.random() * h) / cellSize)
      )
    }

    resize()

    const ro = new ResizeObserver(resize)
    if (canvas.parentElement) ro.observe(canvas.parentElement)

    let raf = 0
    let last = performance.now()
    const minInterval = 1000 / fps

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw)
      if (now - last < minInterval) return
      last = now

      const w = canvas.width / dpr
      const h = canvas.height / dpr

      // fade previous frame — this creates the trailing tail
      ctx.fillStyle = palette.fade
      ctx.fillRect(0, 0, w, h)

      for (let i = 0; i < columns; i++) {
        const x = i * cellSize
        const y = drops[i] * cellSize

        // tail char
        ctx.fillStyle = palette.tail
        ctx.fillText(pickGlyph(), x, y - cellSize)

        // bright leader char
        ctx.fillStyle = palette.leader
        ctx.fillText(pickGlyph(), x, y)

        // reset to top with some randomness
        if (y > h && Math.random() > 0.975) {
          drops[i] = 0
        }
        drops[i]++
      }
    }

    raf = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [intensity, cellSize, fps, resolvedTheme])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="absolute inset-0 h-full w-full"
    />
  )
}
