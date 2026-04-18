import { LoginScreen } from "@/screens/login-screen"
import { Desktop } from "@/screens/desktop"
import { AppearanceProvider } from "@/state/appearance"
import { ContextMenuProvider } from "@/state/context-menu"
import { DaemonProvider } from "@/state/daemon"
import { PlaythroughProvider } from "@/state/playthrough"
import { SessionProvider, useSession } from "@/state/session"
import { SystemProvider } from "@/state/system"
import { WindowsProvider } from "@/state/windows"

function Shell() {
  const { user } = useSession()
  return (
    <div className="relative h-full w-full overflow-hidden bg-background text-foreground">
      {user ? (
        <DaemonProvider username={user.name}>
          <PlaythroughProvider>
            <WindowsProvider>
              <Desktop />
            </WindowsProvider>
          </PlaythroughProvider>
        </DaemonProvider>
      ) : (
        <LoginScreen />
      )}
    </div>
  )
}

export function App() {
  return (
    <AppearanceProvider>
      <SessionProvider>
        <SystemProvider>
          <ContextMenuProvider>
            <Shell />
          </ContextMenuProvider>
        </SystemProvider>
      </SessionProvider>
    </AppearanceProvider>
  )
}
