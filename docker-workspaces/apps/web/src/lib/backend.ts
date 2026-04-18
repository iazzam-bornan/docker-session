// Single source of truth for the backend's origin. The Vite dev server
// runs on a different port than the Bun backend, so we hardcode the port
// here. In a production deployment we'd serve both behind the same origin
// and just use empty strings.

const BACKEND_PORT = 4000

/** http(s):// origin of the backend */
export function backendOrigin(): string {
  if (typeof window === "undefined") return `http://localhost:${BACKEND_PORT}`
  const proto = location.protocol === "https:" ? "https:" : "http:"
  const host = location.hostname || "localhost"
  return `${proto}//${host}:${BACKEND_PORT}`
}

/** ws(s):// origin of the backend */
export function backendWsOrigin(): string {
  if (typeof window === "undefined") return `ws://localhost:${BACKEND_PORT}`
  const proto = location.protocol === "https:" ? "wss:" : "ws:"
  const host = location.hostname || "localhost"
  return `${proto}//${host}:${BACKEND_PORT}`
}

/** Build a search-results URL on the backend. */
export function searchUrl(query: string): string {
  return `${backendOrigin()}/search?q=${encodeURIComponent(query)}`
}

/** Build a reader-mode URL on the backend. */
export function readerUrl(target: string): string {
  return `${backendOrigin()}/reader?url=${encodeURIComponent(target)}`
}
