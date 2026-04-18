import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"

import { LockIcon } from "@/components/system-icons"
import { readerUrl, searchUrl } from "@/lib/backend"
import { useDaemon } from "@/state/daemon"

// ─── url model ───────────────────────────────────────────────────────────

const NEW_TAB = "dockerlab://new-tab"

type PageKind = "newtab" | "docs" | "hub" | "preview" | "search" | "external"

const SEARCH_PREFIX = "dockerlab://search?q="

function searchInternalUrl(query: string): string {
  return `${SEARCH_PREFIX}${encodeURIComponent(query)}`
}

function searchQueryFromUrl(url: string): string {
  if (!url.startsWith(SEARCH_PREFIX)) return ""
  try {
    return decodeURIComponent(url.slice(SEARCH_PREFIX.length))
  } catch {
    return url.slice(SEARCH_PREFIX.length)
  }
}

function normalizeUrl(input: string): string {
  const t = input.trim()
  if (!t) return NEW_TAB
  if (t === "newtab" || t === "new tab") return NEW_TAB
  if (t.startsWith("dockerlab://")) return t
  if (/^https?:\/\//i.test(t)) return t

  // looks like a domain (has a dot, no spaces)
  if (/^[\w.-]+\.[\w.-]+/.test(t) && !/\s/.test(t)) {
    return `https://${t}`
  }
  // search query → internal search route
  return searchInternalUrl(t)
}

function pageKindFromUrl(url: string): PageKind {
  if (url === NEW_TAB) return "newtab"
  if (url.startsWith(SEARCH_PREFIX)) return "search"
  try {
    const u = new URL(url)
    // u.hostname strips the port; u.host includes it. We want to match
    // any localhost URL regardless of port — this is the path that opens
    // the user's containers in the in-app browser.
    const hostname = u.hostname.toLowerCase()
    const host = u.host.toLowerCase()
    if (host.includes("docs.dockerlab")) return "docs"
    if (host.includes("hub.dockerlab")) return "hub"
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1"
    ) {
      return "preview"
    }
    return "external"
  } catch {
    return "external"
  }
}

function titleFromUrl(url: string): string {
  if (url === NEW_TAB) return "new tab"
  const kind = pageKindFromUrl(url)
  if (kind === "docs") return "Get started — dockerlab docs"
  if (kind === "hub") return "Explore — dockerlab hub"
  if (kind === "preview") return "greeter-api · localhost"
  if (kind === "search") {
    const q = searchQueryFromUrl(url)
    return q ? `${q} — search` : "search"
  }
  try {
    return new URL(url).host.replace(/^www\./, "")
  } catch {
    return "untitled"
  }
}

function faviconLetter(url: string): string {
  if (url === NEW_TAB) return "∎"
  if (url.startsWith(SEARCH_PREFIX)) return "S"
  try {
    return new URL(url).host.replace(/^www\./, "").charAt(0).toUpperCase()
  } catch {
    return "?"
  }
}

// ─── icons ────────────────────────────────────────────────────────────────

const SVG_PROPS = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
}

const ArrowLeft = (p: { className?: string }) => (
  <svg {...SVG_PROPS} className={p.className}>
    <path d="M19 12H5M12 19l-7-7 7-7" />
  </svg>
)
const ArrowRight = (p: { className?: string }) => (
  <svg {...SVG_PROPS} className={p.className}>
    <path d="M5 12h14M12 5l7 7-7 7" />
  </svg>
)
const Reload = (p: { className?: string }) => (
  <svg {...SVG_PROPS} className={p.className}>
    <path d="M3 12a9 9 0 0 1 15.5-6.3L21 8" />
    <path d="M21 3v5h-5" />
    <path d="M21 12a9 9 0 0 1-15.5 6.3L3 16" />
    <path d="M3 21v-5h5" />
  </svg>
)
const Plus = (p: { className?: string }) => (
  <svg {...SVG_PROPS} className={p.className}>
    <path d="M12 5v14M5 12h14" />
  </svg>
)
const Close = (p: { className?: string }) => (
  <svg {...SVG_PROPS} className={p.className}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
)
const Star = (p: { className?: string }) => (
  <svg {...SVG_PROPS} className={p.className}>
    <path d="m12 3 2.6 5.6L20 9l-4 3.9.9 5.6L12 16l-4.9 2.5L8 12.9 4 9l5.4-.4L12 3Z" />
  </svg>
)
const Dots = (p: { className?: string }) => (
  <svg {...SVG_PROPS} className={p.className}>
    <circle cx="5" cy="12" r="1" />
    <circle cx="12" cy="12" r="1" />
    <circle cx="19" cy="12" r="1" />
  </svg>
)
const SearchIcon = (p: { className?: string }) => (
  <svg {...SVG_PROPS} className={p.className}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
)
const Shield = (p: { className?: string }) => (
  <svg {...SVG_PROPS} className={p.className}>
    <path d="M12 2 4 6v6c0 5 3.5 9 8 10 4.5-1 8-5 8-10V6l-8-4Z" />
  </svg>
)

// ─── tab model ───────────────────────────────────────────────────────────

type Tab = {
  id: number
  history: string[]
  cursor: number
  loading: boolean
}

let tabIdCounter = 0
const nextTabId = () => ++tabIdCounter

function makeTab(initial: string = NEW_TAB): Tab {
  return { id: nextTabId(), history: [initial], cursor: 0, loading: false }
}

// ─── pages ───────────────────────────────────────────────────────────────

function NewTabPage({
  onNavigate,
}: {
  onNavigate: (url: string) => void
}) {
  const bookmarks = [
    {
      title: "your container",
      sub: "localhost:3000",
      url: "http://localhost:3000",
    },
    {
      title: "dockerlab docs",
      sub: "docs.dockerlab.dev",
      url: "https://docs.dockerlab.dev/get-started",
    },
    {
      title: "registry hub",
      sub: "hub.dockerlab.dev",
      url: "https://hub.dockerlab.dev/explore",
    },
    {
      title: "wikipedia · docker",
      sub: "en.wikipedia.org",
      url: "https://en.wikipedia.org/wiki/Docker_(software)",
    },
  ]

  return (
    <div className="flex min-h-full flex-col items-center justify-center px-8 py-12">
      <div className="font-display mb-2 text-4xl tracking-tight text-foreground">
        dockerlab
      </div>
      <div className="mb-8 font-mono text-[11px] tracking-widest text-foreground/40 uppercase">
        a quiet little browser
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          const fd = new FormData(e.currentTarget as HTMLFormElement)
          const q = String(fd.get("q") ?? "").trim()
          if (q) onNavigate(normalizeUrl(q))
        }}
        className="mb-10 w-full max-w-md"
      >
        <div className="flex h-11 items-center gap-3 rounded-full border border-border bg-surface-sunken px-4 backdrop-blur-md focus-within:border-foreground/25">
          <SearchIcon className="size-4 text-foreground/45" />
          <input
            name="q"
            placeholder="search wikipedia or enter a url…"
            spellCheck={false}
            autoFocus
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-foreground/35 outline-none"
          />
          <kbd className="rounded border border-border bg-surface-elevated px-1.5 py-0.5 font-mono text-[9px] text-foreground/55">
            return
          </kbd>
        </div>
      </form>

      <div className="grid w-full max-w-2xl grid-cols-4 gap-3">
        {bookmarks.map((b) => (
          <button
            key={b.url}
            type="button"
            onClick={() => onNavigate(b.url)}
            className="group flex flex-col items-start gap-2 rounded-xl border border-border bg-surface-sunken p-3 text-left transition hover:border-foreground/25 hover:bg-surface-sunken"
          >
            <div className="grid size-8 place-items-center rounded-lg border border-border bg-surface-elevated text-sm font-medium text-foreground/85">
              {b.title.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 leading-tight">
              <div className="truncate text-[12px] text-foreground/90">{b.title}</div>
              <div className="truncate font-mono text-[10px] text-foreground/40">
                {b.sub}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

function DocsPage() {
  return (
    <article className="mx-auto max-w-2xl px-10 py-10 text-[13px] leading-relaxed text-foreground/80">
      <div className="font-mono text-[10px] tracking-widest text-foreground/40 uppercase">
        get started
      </div>
      <h1 className="font-display mt-2 text-3xl tracking-tight text-foreground">
        Your first container
      </h1>
      <p className="mt-3 text-foreground/65">
        A container is just a process running with its own filesystem,
        network, and limits — and Docker is the tool that builds and runs them
        for you in a way that's reproducible across machines.
      </p>

      <h2 className="mt-8 mb-2 text-base text-foreground">1. Write a Dockerfile</h2>
      <p className="text-foreground/65">
        Each line in a Dockerfile produces a new layer. Order matters: put
        slow-changing things at the top so the cache hits as often as possible.
      </p>
      <pre className="mt-3 overflow-x-auto rounded-md border border-border bg-surface-sunken p-3 font-mono text-[11px] text-foreground/85">
{`FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
CMD ["node", "server.js"]`}
      </pre>

      <h2 className="mt-8 mb-2 text-base text-foreground">2. Build the image</h2>
      <pre className="mt-3 overflow-x-auto rounded-md border border-border bg-surface-sunken p-3 font-mono text-[11px] text-foreground/85">
{`$ docker build -t greeter .`}
      </pre>

      <h2 className="mt-8 mb-2 text-base text-foreground">3. Run it</h2>
      <pre className="mt-3 overflow-x-auto rounded-md border border-border bg-surface-sunken p-3 font-mono text-[11px] text-foreground/85">
{`$ docker run -p 3000:3000 greeter`}
      </pre>

      <div className="mt-10 flex items-center justify-between border-t border-border pt-4 font-mono text-[10px] text-foreground/35">
        <span>last updated · 2 days ago</span>
        <span>edit this page →</span>
      </div>
    </article>
  )
}

function HubPage() {
  const repos = [
    { name: "library/node", pulls: "1.2B", desc: "Node.js runtime", official: true },
    { name: "library/postgres", pulls: "892M", desc: "PostgreSQL database", official: true },
    { name: "library/nginx", pulls: "2.1B", desc: "High-performance web server", official: true },
    { name: "library/redis", pulls: "1.4B", desc: "In-memory data store", official: true },
    { name: "library/python", pulls: "1.0B", desc: "Python interpreter", official: true },
    { name: "dockerlab/greeter", pulls: "12", desc: "tiny demo express app", official: false },
  ]

  return (
    <div className="mx-auto max-w-3xl px-10 py-8">
      <div className="mb-6">
        <div className="font-mono text-[10px] tracking-widest text-foreground/40 uppercase">
          registry · explore
        </div>
        <h1 className="font-display mt-1 text-2xl text-foreground">popular images</h1>
      </div>

      <div className="mb-6 flex h-10 items-center gap-3 rounded-lg border border-border bg-surface-sunken px-4">
        <SearchIcon className="size-4 text-foreground/45" />
        <input
          placeholder="search images…"
          spellCheck={false}
          className="flex-1 bg-transparent text-sm text-foreground placeholder:text-foreground/35 outline-none"
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-surface-sunken">
        {repos.map((r, i) => (
          <div
            key={r.name}
            className={cn(
              "flex items-center gap-4 px-4 py-3 hover:bg-surface-elevated",
              i > 0 && "border-t border-border"
            )}
          >
            <div className="grid size-9 place-items-center rounded-lg border border-border bg-surface-elevated font-mono text-xs text-foreground/75">
              {r.name.charAt(r.name.indexOf("/") + 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-mono text-[12px] text-foreground">
                  {r.name}
                </span>
                {r.official && (
                  <span className="rounded-full border border-border bg-surface-elevated px-1.5 py-px font-mono text-[9px] tracking-wide text-foreground/65">
                    official
                  </span>
                )}
              </div>
              <div className="truncate text-[11px] text-foreground/50">{r.desc}</div>
            </div>
            <div className="text-right">
              <div className="font-mono text-[11px] text-foreground/85 tabular-nums">
                {r.pulls}
              </div>
              <div className="font-mono text-[9px] tracking-wide text-foreground/35 uppercase">
                pulls
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// PreviewPage points the iframe at a localhost URL. The user *thinks*
// they're hitting `localhost:3000`, but if they're in a multi-user session
// the daemon has actually bound the container to (e.g.) host port 30041.
// We translate the guest port → host port via daemon.lookupPort and load
// the iframe at the real URL. The address bar in the toolbar still shows
// the user-typed URL — translation is invisible.
function PreviewPage({ url }: { url: string }) {
  const daemon = useDaemon()
  // null = still resolving, "" = couldn't resolve, otherwise the real URL
  const [iframeSrc, setIframeSrc] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false

    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      setIframeSrc("")
      return
    }
    const guestPort = Number(parsed.port || (parsed.protocol === "https:" ? "443" : "80"))

    daemon
      .lookupPort(guestPort)
      .then((hostPort) => {
        if (cancelled) return
        if (hostPort === null) {
          // No reservation for this port — fall back to the literal URL.
          // If you have something else running on `guestPort` directly,
          // this will work. Otherwise the iframe will show
          // ERR_CONNECTION_REFUSED, which is the right thing.
          setIframeSrc(url)
          return
        }
        const translated = new URL(url)
        translated.port = String(hostPort)
        setIframeSrc(translated.href)
      })
      .catch(() => {
        if (cancelled) return
        setIframeSrc(url)
      })

    return () => {
      cancelled = true
    }
  }, [url, daemon])

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border bg-surface-elevated px-4 py-1.5 text-[10px] text-foreground/65">
        <span className="font-mono text-foreground/55">localhost preview</span>
        <span className="text-foreground/30">·</span>
        <span className="text-foreground/45">
          your container, in your session
        </span>
        <span className="ml-auto truncate font-mono text-foreground/35">{url}</span>
      </div>
      {iframeSrc === null ? (
        <div className="grid flex-1 place-items-center bg-surface-elevated">
          <div className="size-5 animate-spin rounded-full border-2 border-border border-t-foreground/65" />
        </div>
      ) : (
        <iframe
          key={iframeSrc}
          src={iframeSrc}
          title="localhost preview"
          className="h-full w-full flex-1 border-0 bg-white"
          sandbox="allow-scripts allow-forms allow-popups allow-same-origin"
          referrerPolicy="no-referrer"
        />
      )}
    </div>
  )
}

// ─── search page (real DuckDuckGo via /search) ────────────────────────────

type SearchResult = {
  title: string
  url: string
  snippet: string
  displayUrl: string
}

type SearchState =
  | { kind: "loading" }
  | { kind: "ok"; results: SearchResult[] }
  | { kind: "error"; message: string }

function SearchPage({
  url,
  onNavigate,
}: {
  url: string
  onNavigate: (url: string) => void
}) {
  const q = searchQueryFromUrl(url)
  const [state, setState] = React.useState<SearchState>({ kind: "loading" })
  const [draft, setDraft] = React.useState(q)

  React.useEffect(() => {
    setDraft(q)
  }, [q])

  React.useEffect(() => {
    if (!q) {
      setState({ kind: "ok", results: [] })
      return
    }
    let cancelled = false
    setState({ kind: "loading" })
    fetch(searchUrl(q))
      .then(async (r) => {
        if (cancelled) return
        if (!r.ok) {
          const text = await r.text().catch(() => r.statusText)
          setState({ kind: "error", message: `${r.status}: ${text}` })
          return
        }
        const body = (await r.json()) as { results?: SearchResult[] }
        setState({ kind: "ok", results: body.results ?? [] })
      })
      .catch((err) => {
        if (cancelled) return
        setState({
          kind: "error",
          message: err instanceof Error ? err.message : String(err),
        })
      })
    return () => {
      cancelled = true
    }
  }, [q])

  return (
    <div className="mx-auto max-w-2xl px-10 py-8">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          const next = draft.trim()
          if (next) onNavigate(searchInternalUrl(next))
        }}
        className="mb-6"
      >
        <div className="flex h-10 items-center gap-3 rounded-full border border-border bg-surface-sunken px-4 focus-within:border-foreground/25">
          <SearchIcon className="size-4 text-foreground/55" />
          <input
            name="q"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            spellCheck={false}
            autoFocus
            className="flex-1 bg-transparent text-sm text-foreground outline-none"
          />
        </div>
      </form>

      {state.kind === "loading" && (
        <div className="flex items-center gap-2 font-mono text-[11px] text-foreground/45">
          <div className="size-3 animate-spin rounded-full border border-foreground/30 border-t-foreground/85" />
          searching for "{q}"…
        </div>
      )}

      {state.kind === "error" && (
        <div className="rounded-xl border border-border bg-surface-sunken p-5 text-[12px] text-foreground/65">
          <div className="mb-1 text-foreground">search failed</div>
          <pre className="font-mono text-[10px] text-foreground/45">
            {state.message}
          </pre>
        </div>
      )}

      {state.kind === "ok" && state.results.length === 0 && q && (
        <div className="font-mono text-[11px] text-foreground/45">
          no results for "{q}"
        </div>
      )}

      {state.kind === "ok" && state.results.length > 0 && (
        <>
          <div className="mb-6 font-mono text-[11px] text-foreground/45">
            about {state.results.length}+ results for{" "}
            <span className="text-foreground/85">"{q}"</span>
          </div>
          <div className="space-y-5">
            {state.results.map((r) => (
              <div key={r.url}>
                <div className="font-mono text-[10px] text-foreground/45">
                  {r.displayUrl || hostOf(r.url)}
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate(r.url)}
                  className="mt-0.5 block text-left text-[15px] text-foreground hover:underline"
                >
                  {r.title}
                </button>
                {r.snippet && (
                  <p className="mt-1 text-[12px] leading-relaxed text-foreground/55">
                    {r.snippet}
                  </p>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "")
  } catch {
    return url
  }
}

// ─── reader (HTML, image, PDF, text, binary) ──────────────────────────────
//
// the reader returns a discriminated union and we render a different viewer
// per kind. all viewers share the chrome (top breadcrumb, footer link).

type ReaderData =
  | {
      kind: "html"
      url: string
      title: string
      byline: string | null
      siteName: string | null
      excerpt: string | null
      content: string
    }
  | {
      kind: "image"
      url: string
      title: string
      contentType: string
      byteSize: number | null
    }
  | {
      kind: "pdf"
      url: string
      title: string
      byteSize: number | null
    }
  | {
      kind: "text"
      url: string
      title: string
      contentType: string
      content: string
      truncated: boolean
    }
  | {
      kind: "binary"
      url: string
      contentType: string
      byteSize: number | null
    }
  | { kind: "error"; url: string; error: string }

type ReaderState =
  | { kind: "loading" }
  | { kind: "loaded"; data: ReaderData }
  | { kind: "error"; message: string }

function formatBytes(n: number | null): string {
  if (n === null) return "unknown size"
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function ReaderPage({
  url,
  onNavigate,
}: {
  url: string
  onNavigate: (url: string) => void
}) {
  const [state, setState] = React.useState<ReaderState>({ kind: "loading" })

  React.useEffect(() => {
    let cancelled = false
    setState({ kind: "loading" })
    fetch(readerUrl(url))
      .then(async (r) => {
        if (cancelled) return
        const body = (await r.json()) as ReaderData
        if (!body || typeof body !== "object" || !("kind" in body)) {
          setState({ kind: "error", message: "malformed reader response" })
          return
        }
        setState({ kind: "loaded", data: body })
      })
      .catch((err) => {
        if (cancelled) return
        setState({
          kind: "error",
          message: err instanceof Error ? err.message : String(err),
        })
      })
    return () => {
      cancelled = true
    }
  }, [url])

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border bg-surface-elevated px-4 py-1.5 text-[10px] text-foreground/65">
        <Shield className="size-3 text-foreground/55" />
        <span>{readerLabel(state)}</span>
        <span className="ml-auto truncate font-mono text-foreground/35">{url}</span>
      </div>

      {state.kind === "loading" && (
        <div className="grid flex-1 place-items-center">
          <div className="size-5 animate-spin rounded-full border-2 border-border border-t-foreground/65" />
        </div>
      )}

      {state.kind === "error" && (
        <ReaderErrorPanel url={url} message={state.message} />
      )}

      {state.kind === "loaded" && state.data.kind === "error" && (
        <ReaderErrorPanel url={url} message={state.data.error} />
      )}

      {state.kind === "loaded" && state.data.kind === "html" && (
        <HtmlViewer data={state.data} url={url} onNavigate={onNavigate} />
      )}

      {state.kind === "loaded" && state.data.kind === "image" && (
        <ImageViewer data={state.data} />
      )}

      {state.kind === "loaded" && state.data.kind === "pdf" && (
        <PdfViewer data={state.data} />
      )}

      {state.kind === "loaded" && state.data.kind === "text" && (
        <TextViewer data={state.data} />
      )}

      {state.kind === "loaded" && state.data.kind === "binary" && (
        <BinaryPanel url={url} data={state.data} />
      )}
    </div>
  )
}

function readerLabel(state: ReaderState): string {
  if (state.kind === "loading") return "fetching…"
  if (state.kind === "error") return "reader · error"
  switch (state.data.kind) {
    case "html":
      return "reader mode — extracted by dockerlab"
    case "image":
      return `image · ${state.data.contentType}`
    case "pdf":
      return "pdf document"
    case "text":
      return `text · ${state.data.contentType}`
    case "binary":
      return `binary · ${state.data.contentType}`
    case "error":
      return "reader · error"
  }
}

function ReaderErrorPanel({ url, message }: { url: string; message: string }) {
  return (
    <div className="grid flex-1 place-items-center px-8">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 grid size-12 place-items-center rounded-full border border-border bg-surface-elevated">
          <Shield className="size-5 text-foreground/55" />
        </div>
        <div className="font-display text-lg text-foreground">
          couldn't read this page
        </div>
        <p className="mt-2 text-[12px] leading-relaxed text-foreground/55">
          The dockerlab reader fetches a URL and renders it for you. Most
          articles, blogs, docs, images, PDFs, and text files work. Sites
          that need a real browser (paywalls, oauth, JS-only apps) won't.
        </p>
        <pre className="mt-3 overflow-x-auto rounded border border-border bg-surface-sunken px-3 py-2 font-mono text-[10px] text-foreground/55">
          {message}
        </pre>
        <a
          href={url}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-elevated px-3 py-1.5 text-[12px] text-foreground hover:bg-surface-elevated"
        >
          open in your real browser ↗
        </a>
      </div>
    </div>
  )
}

function HtmlViewer({
  data,
  url,
  onNavigate,
}: {
  data: Extract<ReaderData, { kind: "html" }>
  url: string
  onNavigate: (url: string) => void
}) {
  // Intercept link clicks inside the reader content so navigation stays
  // inside the in-browser browser instead of opening real tabs.
  const onContentClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = (e.target as HTMLElement).closest("a")
    if (!target) return
    const href = target.getAttribute("href")
    if (!href) return
    e.preventDefault()
    onNavigate(href)
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <article className="reader-prose mx-auto max-w-2xl px-10 py-10">
        {data.siteName && (
          <div className="mb-2 font-mono text-[10px] tracking-widest text-foreground/40 uppercase">
            {data.siteName}
          </div>
        )}
        <h1 className="font-display text-3xl tracking-tight text-foreground">
          {data.title}
        </h1>
        {data.byline && (
          <div className="mt-2 text-[12px] text-foreground/55">{data.byline}</div>
        )}
        {data.excerpt && (
          <p className="mt-4 text-[13px] leading-relaxed text-foreground/65 italic">
            {data.excerpt}
          </p>
        )}
        <div
          className="reader-body mt-6 text-[13px] leading-relaxed text-foreground/80"
          onClick={onContentClick}
          dangerouslySetInnerHTML={{ __html: data.content }}
        />
        <div className="mt-10 border-t border-border pt-4 text-center font-mono text-[10px] text-foreground/35">
          extracted from{" "}
          <a
            href={url}
            target="_blank"
            rel="noreferrer noopener"
            className="text-foreground/55 hover:text-foreground"
          >
            {hostOf(url)}
          </a>
        </div>
      </article>
    </div>
  )
}

function ImageViewer({
  data,
}: {
  data: Extract<ReaderData, { kind: "image" }>
}) {
  return (
    <div className="grid min-h-0 flex-1 grid-rows-[1fr_auto] gap-2 bg-surface-sunken p-6">
      <div className="flex min-h-0 items-center justify-center">
        <img
          src={data.url}
          alt={data.title}
          className="max-h-full max-w-full rounded-md object-contain shadow-[0_8px_30px_rgba(0,0,0,0.6)]"
        />
      </div>
      <div className="flex items-center justify-between font-mono text-[10px] text-foreground/55">
        <span className="truncate text-foreground/85">{data.title}</span>
        <span>
          {data.contentType} · {formatBytes(data.byteSize)}
        </span>
      </div>
    </div>
  )
}

function PdfViewer({
  data,
}: {
  data: Extract<ReaderData, { kind: "pdf" }>
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <iframe
        src={data.url}
        title={data.title}
        className="h-full w-full flex-1 border-0 bg-white"
      />
    </div>
  )
}

function TextViewer({
  data,
}: {
  data: Extract<ReaderData, { kind: "text" }>
}) {
  // Light JSON pretty-printing — only when the upstream is application/json
  // and parses cleanly. Otherwise we render the raw payload as-is.
  const display = React.useMemo(() => {
    if (data.contentType.includes("application/json")) {
      try {
        return JSON.stringify(JSON.parse(data.content), null, 2)
      } catch {
        return data.content
      }
    }
    return data.content
  }, [data.content, data.contentType])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <pre className="min-h-0 flex-1 overflow-auto bg-surface-sunken p-6 font-mono text-[11px] leading-relaxed text-foreground/85">
        {display}
      </pre>
      {data.truncated && (
        <div className="border-t border-border bg-surface-elevated px-4 py-1.5 font-mono text-[10px] text-foreground/55">
          response truncated at 2 MB
        </div>
      )}
    </div>
  )
}

function BinaryPanel({
  url,
  data,
}: {
  url: string
  data: Extract<ReaderData, { kind: "binary" }>
}) {
  return (
    <div className="grid flex-1 place-items-center px-8">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 grid size-12 place-items-center rounded-full border border-border bg-surface-elevated">
          <Shield className="size-5 text-foreground/55" />
        </div>
        <div className="font-display text-lg text-foreground">
          binary file
        </div>
        <p className="mt-2 text-[12px] leading-relaxed text-foreground/55">
          The dockerlab browser doesn't have a viewer for{" "}
          <span className="font-mono text-foreground/85">{data.contentType}</span>{" "}
          ({formatBytes(data.byteSize)}).
        </p>
        <a
          href={url}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-elevated px-3 py-1.5 text-[12px] text-foreground hover:bg-surface-elevated"
        >
          download in your real browser ↗
        </a>
      </div>
    </div>
  )
}

function PageRenderer({
  url,
  onNavigate,
}: {
  url: string
  onNavigate: (url: string) => void
}) {
  const kind = pageKindFromUrl(url)
  switch (kind) {
    case "newtab":
      return <NewTabPage onNavigate={onNavigate} />
    case "docs":
      return <DocsPage />
    case "hub":
      return <HubPage />
    case "preview":
      return <PreviewPage url={url} />
    case "search":
      return <SearchPage url={url} onNavigate={onNavigate} />
    case "external":
      return <ReaderPage url={url} onNavigate={onNavigate} />
  }
}

// ─── main browser ────────────────────────────────────────────────────────

export function BrowserApp() {
  const [tabs, setTabs] = React.useState<Tab[]>(() => [makeTab()])
  const [activeId, setActiveId] = React.useState<number>(() => tabs[0].id)
  const [addressDraft, setAddressDraft] = React.useState<string>("")
  const [addressFocused, setAddressFocused] = React.useState(false)

  const active = tabs.find((t) => t.id === activeId) ?? tabs[0]
  const currentUrl = active.history[active.cursor]
  const currentKind = pageKindFromUrl(currentUrl)

  React.useEffect(() => {
    if (!addressFocused) {
      setAddressDraft(currentUrl === NEW_TAB ? "" : currentUrl)
    }
  }, [currentUrl, addressFocused])

  const updateTab = React.useCallback(
    (id: number, fn: (t: Tab) => Tab) => {
      setTabs((cur) => cur.map((t) => (t.id === id ? fn(t) : t)))
    },
    []
  )

  const navigate = React.useCallback(
    (rawUrl: string) => {
      const url = normalizeUrl(rawUrl)
      updateTab(activeId, (t) => {
        // truncate forward history
        const newHistory = [...t.history.slice(0, t.cursor + 1), url]
        return {
          ...t,
          history: newHistory,
          cursor: newHistory.length - 1,
          loading: true,
        }
      })
      window.setTimeout(() => {
        updateTab(activeId, (t) => ({ ...t, loading: false }))
      }, 220)
    },
    [activeId, updateTab]
  )

  const goBack = () => {
    if (active.cursor === 0) return
    updateTab(activeId, (t) => ({ ...t, cursor: t.cursor - 1 }))
  }
  const goForward = () => {
    if (active.cursor >= active.history.length - 1) return
    updateTab(activeId, (t) => ({ ...t, cursor: t.cursor + 1 }))
  }
  const reload = () => {
    updateTab(activeId, (t) => ({ ...t, loading: true }))
    window.setTimeout(
      () => updateTab(activeId, (t) => ({ ...t, loading: false })),
      300
    )
  }

  const newTab = () => {
    const t = makeTab()
    setTabs((cur) => [...cur, t])
    setActiveId(t.id)
  }
  const closeTab = (id: number) => {
    setTabs((cur) => {
      if (cur.length === 1) {
        const replacement = makeTab()
        setActiveId(replacement.id)
        return [replacement]
      }
      const idx = cur.findIndex((t) => t.id === id)
      const next = cur.filter((t) => t.id !== id)
      if (id === activeId) {
        const fallback = next[Math.max(0, idx - 1)] ?? next[0]
        setActiveId(fallback.id)
      }
      return next
    })
  }

  const onAddressSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!addressDraft.trim()) return
    navigate(addressDraft)
    ;(e.target as HTMLFormElement).querySelector("input")?.blur()
  }

  const canBack = active.cursor > 0
  const canForward = active.cursor < active.history.length - 1

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* tab strip */}
      <div className="flex h-9 items-end gap-1 border-b border-border bg-surface-sunken px-2 pt-1.5">
        {tabs.map((t) => {
          const tUrl = t.history[t.cursor]
          const isActive = t.id === activeId
          return (
            <button
              key={t.id}
              onClick={() => setActiveId(t.id)}
              className={cn(
                "group flex h-7 max-w-[180px] min-w-0 items-center gap-2 rounded-t-md border border-b-0 px-2.5 text-[11px]",
                isActive
                  ? "border-border bg-card text-foreground"
                  : "border-transparent text-foreground/55 hover:bg-surface-elevated hover:text-foreground/85"
              )}
            >
              {t.loading ? (
                <div className="size-3 shrink-0 animate-spin rounded-full border border-foreground/30 border-t-foreground" />
              ) : (
                <span className="grid size-4 shrink-0 place-items-center rounded-sm border border-border bg-surface-elevated text-[9px] font-bold text-foreground/85">
                  {faviconLetter(tUrl)}
                </span>
              )}
              <span className="min-w-0 flex-1 truncate text-left">
                {titleFromUrl(tUrl)}
              </span>
              <span
                onClick={(e) => {
                  e.stopPropagation()
                  closeTab(t.id)
                }}
                className="grid size-4 shrink-0 place-items-center rounded-sm text-foreground/35 opacity-0 hover:bg-surface-elevated hover:text-foreground group-hover:opacity-100"
                aria-label="close tab"
              >
                <Close className="size-3" />
              </span>
            </button>
          )
        })}
        <button
          onClick={newTab}
          className="grid size-6 place-items-center rounded text-foreground/55 hover:bg-surface-elevated hover:text-foreground"
          aria-label="new tab"
        >
          <Plus className="size-3.5" />
        </button>
      </div>

      {/* toolbar */}
      <div className="flex h-11 items-center gap-2 border-b border-border bg-surface-sunken px-3">
        <button
          onClick={goBack}
          disabled={!canBack}
          className="grid size-7 place-items-center rounded-md text-foreground/75 hover:bg-surface-elevated hover:text-foreground disabled:cursor-default disabled:text-foreground/20 disabled:hover:bg-transparent"
          aria-label="back"
        >
          <ArrowLeft className="size-4" />
        </button>
        <button
          onClick={goForward}
          disabled={!canForward}
          className="grid size-7 place-items-center rounded-md text-foreground/75 hover:bg-surface-elevated hover:text-foreground disabled:cursor-default disabled:text-foreground/20 disabled:hover:bg-transparent"
          aria-label="forward"
        >
          <ArrowRight className="size-4" />
        </button>
        <button
          onClick={reload}
          className="grid size-7 place-items-center rounded-md text-foreground/75 hover:bg-surface-elevated hover:text-foreground"
          aria-label="reload"
        >
          <Reload className={cn("size-4", active.loading && "animate-spin")} />
        </button>

        <form onSubmit={onAddressSubmit} className="min-w-0 flex-1">
          <div
            className={cn(
              "flex h-7 items-center gap-2 rounded-full border bg-surface-sunken px-3 transition",
              addressFocused
                ? "border-foreground/30 bg-surface-sunken"
                : "border-border hover:border-foreground/18"
            )}
          >
            {currentUrl.startsWith("https://") ? (
              <LockIcon className="size-3 shrink-0 text-foreground/60" />
            ) : currentUrl.startsWith("http://") ? (
              <span className="font-mono text-[9px] tracking-wide text-foreground/45 uppercase">
                http
              </span>
            ) : (
              <span className="font-mono text-[9px] tracking-wide text-foreground/45 uppercase">
                int
              </span>
            )}
            <input
              value={addressDraft}
              onChange={(e) => setAddressDraft(e.target.value)}
              onFocus={(e) => {
                setAddressFocused(true)
                e.currentTarget.select()
              }}
              onBlur={() => {
                setAddressFocused(false)
                setAddressDraft(currentUrl === NEW_TAB ? "" : currentUrl)
              }}
              placeholder="search wikipedia or enter a url…"
              spellCheck={false}
              className="min-w-0 flex-1 bg-transparent font-mono text-[11px] text-foreground placeholder:text-foreground/35 outline-none"
            />
            <Star className="size-3.5 shrink-0 text-foreground/35 hover:text-foreground/85" />
          </div>
        </form>

        <button
          className="grid size-7 place-items-center rounded-md text-foreground/75 hover:bg-surface-elevated hover:text-foreground"
          aria-label="menu"
        >
          <Dots className="size-4" />
        </button>

        <div className="ml-1 grid size-6 place-items-center rounded-full border border-border bg-surface-elevated text-[10px] text-foreground/85">
          U
        </div>
      </div>

      {/* page */}
      <div
        key={`${activeId}-${active.cursor}-${active.loading ? "load" : "ready"}`}
        className={cn(
          "fade-in min-h-0 flex-1",
          currentKind === "external" || currentKind === "preview"
            ? "overflow-hidden"
            : "overflow-y-auto"
        )}
      >
        {active.loading ? (
          <div className="grid h-full place-items-center">
            <div className="size-5 animate-spin rounded-full border-2 border-border border-t-foreground/65" />
          </div>
        ) : (
          <PageRenderer url={currentUrl} onNavigate={navigate} />
        )}
      </div>

      {/* status bar */}
      <div className="flex h-5 items-center justify-between border-t border-border bg-surface-sunken px-3 font-mono text-[10px] text-foreground/40">
        <span className="truncate">{currentUrl}</span>
        <span>
          {active.history.length} step
          {active.history.length === 1 ? "" : "s"} in history
        </span>
      </div>
    </div>
  )
}
