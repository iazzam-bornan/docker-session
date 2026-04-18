import * as React from "react"

import { Wallpaper } from "@/components/wallpaper"
import { TopBar } from "@/components/top-bar"
import { Dock } from "@/components/dock"
import { DesktopIcons } from "@/components/desktop-icons"
import { Window } from "@/components/window"
import { QuickSettings } from "@/components/quick-settings"
import { TerminalApp } from "@/apps/terminal-app"
import { FilesApp } from "@/apps/files-app"
import { WelcomeApp } from "@/apps/welcome-app"
import { ContainersApp } from "@/apps/containers-app"
import { SettingsApp } from "@/apps/settings-app"
import { BrowserApp } from "@/apps/browser-app"
import { CodeApp } from "@/apps/code-app"
import { useAppearance } from "@/state/appearance"
import { useContextMenu } from "@/state/context-menu"
import { useWindows, type AppId } from "@/state/windows"

const APP_RENDERERS: Record<AppId, React.ComponentType> = {
  terminal: TerminalApp,
  files: FilesApp,
  welcome: WelcomeApp,
  containers: ContainersApp,
  settings: SettingsApp,
  browser: BrowserApp,
  code: CodeApp,
}

export function Desktop() {
  const { windows, open } = useWindows()
  const appearance = useAppearance()
  const ctx = useContextMenu()
  const [trayOpen, setTrayOpen] = React.useState(false)

  // Only open the welcome app on the very first session, not on every
  // mount — windows are persisted now, so reopening should restore the
  // user's last layout instead of slamming a welcome window on top.
  React.useEffect(() => {
    if (windows.length === 0) {
      open("welcome")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Right-clicking the wallpaper opens a desktop context menu — like
  // every real OS. The dock and per-icon menus are wired in their own
  // components so they can build menus from their local state.
  const onWallpaperContext = ctx.bind(() => [
    { kind: "header", label: "desktop" },
    {
      label: "Open Welcome",
      onClick: () => open("welcome"),
    },
    {
      label: "Open Terminal here",
      onClick: () => open("terminal"),
    },
    {
      label: "Open Files",
      onClick: () => open("files"),
    },
    { kind: "separator" },
    {
      label:
        appearance.resolvedTheme === "dark"
          ? "Switch to Light Mode"
          : "Switch to Dark Mode",
      onClick: () => appearance.toggleTheme(),
    },
    {
      label: "Display Settings…",
      onClick: () => open("settings"),
    },
  ])

  return (
    <div
      className="relative h-full w-full"
      onContextMenu={onWallpaperContext}
    >
      <Wallpaper />
      <TopBar
        onTrayClick={() => setTrayOpen((v) => !v)}
        trayOpen={trayOpen}
      />
      {trayOpen && <QuickSettings onClose={() => setTrayOpen(false)} />}
      <DesktopIcons />

      {windows.map((win) => {
        const Component = APP_RENDERERS[win.app]
        return (
          <Window key={win.id} win={win}>
            <Component />
          </Window>
        )
      })}

      <Dock />
    </div>
  )
}
