/* eslint-disable react-refresh/only-export-components */
import * as React from "react"

type User = {
  name: string
  loginAt: number
}

type SessionContextValue = {
  user: User | null
  knownUsers: User[]
  signIn: (name: string) => void
  signOut: () => void
  forgetUser: (name: string) => void
}

const SessionContext = React.createContext<SessionContextValue | undefined>(
  undefined
)

const STORAGE_KEY = "dockerlab.session.v1"
const KNOWN_KEY = "dockerlab.known.v1"
const MAX_KNOWN = 6

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<User | null>(() =>
    readJSON<User | null>(STORAGE_KEY, null)
  )
  const [knownUsers, setKnownUsers] = React.useState<User[]>(() =>
    readJSON<User[]>(KNOWN_KEY, [])
  )

  const persistKnown = React.useCallback((next: User[]) => {
    setKnownUsers(next)
    localStorage.setItem(KNOWN_KEY, JSON.stringify(next))
  }, [])

  const signIn = React.useCallback(
    (name: string) => {
      const trimmed = name.trim()
      if (!trimmed) return
      const next: User = { name: trimmed, loginAt: Date.now() }
      setUser(next)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))

      // bubble this user to the front of the known list
      setKnownUsers((current) => {
        const filtered = current.filter(
          (u) => u.name.toLowerCase() !== trimmed.toLowerCase()
        )
        const updated = [next, ...filtered].slice(0, MAX_KNOWN)
        localStorage.setItem(KNOWN_KEY, JSON.stringify(updated))
        return updated
      })
    },
    []
  )

  const signOut = React.useCallback(() => {
    setUser(null)
    localStorage.removeItem(STORAGE_KEY)
  }, [])

  const forgetUser = React.useCallback(
    (name: string) => {
      const next = knownUsers.filter(
        (u) => u.name.toLowerCase() !== name.toLowerCase()
      )
      persistKnown(next)
    },
    [knownUsers, persistKnown]
  )

  const value = React.useMemo(
    () => ({ user, knownUsers, signIn, signOut, forgetUser }),
    [user, knownUsers, signIn, signOut, forgetUser]
  )

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  )
}

export function useSession() {
  const ctx = React.useContext(SessionContext)
  if (!ctx) throw new Error("useSession must be used within SessionProvider")
  return ctx
}
