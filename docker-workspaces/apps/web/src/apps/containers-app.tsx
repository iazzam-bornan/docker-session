import * as React from "react"

import type {
  ContainerFileEntry,
  ContainerInfo,
  ContainerStatsSample,
  HostInfo,
  ImageInfo,
} from "@workspace/protocol"
import { cn } from "@workspace/ui/lib/utils"

import { useDaemon } from "@/state/daemon"

// ─────────────────────────────────────────────────────────────────────────
// containers app — Docker Desktop style
//
// two views:
//   1. ContainerList — dense table with icon-only action buttons, stats
//      polled every 2 seconds, search + "only running" filter
//   2. ContainerDetail — per-container pane with Logs / Exec / Files /
//      Stats tabs, live header showing ID/image/ports/state, action
//      buttons (stop/start/restart/remove)
//
// clicking a row in the list opens the detail view. the back button in
// the detail header returns to the list.
// ─────────────────────────────────────────────────────────────────────────

const POLL_MS = 2_000
const STATS_POLL_MS = 2_000
const STATS_WINDOW = 60

// ─── outer shell ─────────────────────────────────────────────────────────

type Tab =
  | "gordon"
  | "containers"
  | "images"
  | "volumes"
  | "kubernetes"
  | "builds"
  | "hub"
  | "scout"
  | "models"
  | "mcp"
  | "extensions"
  | "activity"

type LoadState =
  | { kind: "loading" }
  | { kind: "ok"; containers: ContainerInfo[]; images: ImageInfo[] }
  | { kind: "error"; message: string }

type ActivityEvent = {
  id: number
  at: number
  kind:
    | "created"
    | "started"
    | "stopped"
    | "removed"
    | "image-built"
    | "image-removed"
  target: string
  detail?: string
}

let activityCounter = 0
const nextActivityId = () => ++activityCounter

export function ContainersApp() {
  const daemon = useDaemon()
  const [state, setState] = React.useState<LoadState>({ kind: "loading" })
  const [tab, setTab] = React.useState<Tab>("containers")
  const [busy, setBusy] = React.useState<string | null>(null)
  const [actionError, setActionError] = React.useState<string | null>(null)

  const [search, setSearch] = React.useState("")
  const [runningOnly, setRunningOnly] = React.useState(false)
  const [activity, setActivity] = React.useState<ActivityEvent[]>([])
  const [lastPolledAt, setLastPolledAt] = React.useState<number | null>(null)

  // when set, the detail view is open on this raw container name
  const [selectedRawName, setSelectedRawName] = React.useState<string | null>(
    null
  )

  const prevSnapshotRef = React.useRef<{
    containers: ContainerInfo[]
    images: ImageInfo[]
  } | null>(null)

  // poll the inventory
  React.useEffect(() => {
    if (daemon.connection !== "open") return
    let cancelled = false

    const tick = async () => {
      const res = await daemon.listInventory()
      if (cancelled) return
      if (!res.ok) {
        setState({ kind: "error", message: res.error })
        return
      }
      setState({
        kind: "ok",
        containers: res.containers,
        images: res.images,
      })
      setLastPolledAt(Date.now())

      // diff snapshots to derive activity events
      const prev = prevSnapshotRef.current
      if (prev) {
        const events: ActivityEvent[] = []
        const prevC = new Map(prev.containers.map((c) => [c.rawName, c]))
        const nextC = new Map(res.containers.map((c) => [c.rawName, c]))
        for (const [name, cur] of nextC) {
          const before = prevC.get(name)
          if (!before) {
            events.push({
              id: nextActivityId(),
              at: Date.now(),
              kind: "created",
              target: cur.name,
              detail: cur.image,
            })
          } else if (before.state !== cur.state) {
            if (cur.state === "running") {
              events.push({
                id: nextActivityId(),
                at: Date.now(),
                kind: "started",
                target: cur.name,
              })
            } else if (cur.state === "exited") {
              events.push({
                id: nextActivityId(),
                at: Date.now(),
                kind: "stopped",
                target: cur.name,
              })
            }
          }
        }
        for (const [name, gone] of prevC) {
          if (!nextC.has(name)) {
            events.push({
              id: nextActivityId(),
              at: Date.now(),
              kind: "removed",
              target: gone.name,
            })
          }
        }
        const prevI = new Set(
          prev.images.map((i) => `${i.rawRepository}:${i.tag}`)
        )
        const nextI = new Set(
          res.images.map((i) => `${i.rawRepository}:${i.tag}`)
        )
        for (const cur of res.images) {
          const key = `${cur.rawRepository}:${cur.tag}`
          if (!prevI.has(key)) {
            events.push({
              id: nextActivityId(),
              at: Date.now(),
              kind: "image-built",
              target: `${cur.repository}:${cur.tag}`,
              detail: cur.size,
            })
          }
        }
        for (const old of prev.images) {
          const key = `${old.rawRepository}:${old.tag}`
          if (!nextI.has(key)) {
            events.push({
              id: nextActivityId(),
              at: Date.now(),
              kind: "image-removed",
              target: `${old.repository}:${old.tag}`,
            })
          }
        }
        if (events.length > 0) {
          setActivity((prev) => [...events.reverse(), ...prev].slice(0, 50))
        }
      }
      prevSnapshotRef.current = {
        containers: res.containers,
        images: res.images,
      }
    }

    tick()
    const id = window.setInterval(tick, POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [daemon.connection, daemon])

  const runAction = async (key: string, command: string) => {
    setBusy(key)
    setActionError(null)
    // The containers app's row actions (start/stop/remove) work on container
    // names, not paths, so the cwd is irrelevant — we just use home.
    const result = await daemon.run(command, "", () => {})
    setBusy(null)
    if (result.status === "rejected") setActionError(result.reason)
    else if (result.status === "error") setActionError(result.message)
    else if (result.status === "ok" && result.exitCode !== 0)
      setActionError(`exit ${result.exitCode}`)
    const inv = await daemon.listInventory()
    if (inv.ok) {
      setState({
        kind: "ok",
        containers: inv.containers,
        images: inv.images,
      })
    }
  }

  const containers = state.kind === "ok" ? state.containers : []
  const images = state.kind === "ok" ? state.images : []
  const running = containers.filter((c) => c.state === "running").length
  const selected = selectedRawName
    ? containers.find((c) => c.rawName === selectedRawName) ?? null
    : null

  // apply search + running filter
  const filteredContainers = containers.filter((c) => {
    if (runningOnly && c.state !== "running") return false
    if (!search) return true
    const q = search.toLowerCase()
    return (
      c.name.toLowerCase().includes(q) || c.image.toLowerCase().includes(q)
    )
  })
  const filteredImages = images.filter((i) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      i.repository.toLowerCase().includes(q) ||
      i.tag.toLowerCase().includes(q) ||
      i.id.toLowerCase().includes(q)
    )
  })

  const isAnyActionInFlight = busy !== null

  // mainContent — what the right pane renders. extracted because we need
  // it inside the same outer chrome regardless of whether we're showing
  // the list, the detail view, or a stub.
  const mainContent = selected ? (
    <ContainerDetail
      container={selected}
      onBack={() => setSelectedRawName(null)}
      busy={busy}
      actionError={actionError}
      onClearError={() => setActionError(null)}
      onAction={runAction}
    />
  ) : tab === "containers" || tab === "images" || tab === "activity" ? (
    <ListPane
      tab={tab}
      state={state}
      busy={busy}
      actionError={actionError}
      onClearError={() => setActionError(null)}
      lastPolledAt={lastPolledAt}
      isAnyActionInFlight={isAnyActionInFlight}
      search={search}
      onSearch={setSearch}
      runningOnly={runningOnly}
      onRunningOnlyChange={setRunningOnly}
      containers={containers}
      filteredContainers={filteredContainers}
      filteredImages={filteredImages}
      activity={activity}
      host={daemon.host}
      onOpen={(c) => setSelectedRawName(c.rawName)}
      onAction={runAction}
    />
  ) : (
    <StubPane tab={tab} />
  )

  return (
    <div className="grid min-h-0 flex-1 grid-rows-[auto_1fr_auto] bg-card">
      <DockerHeader />
      <div className="grid min-h-0 grid-cols-[200px_1fr]">
        <Sidebar
          tab={tab}
          onTab={(t) => {
            setSelectedRawName(null)
            setTab(t)
          }}
          containerCount={containers.length}
          imageCount={images.length}
          activityCount={activity.length}
        />
        <div className="flex min-h-0 flex-col">{mainContent}</div>
      </div>
      <DockerFooter
        connection={daemon.connection}
        sessionId={daemon.sessionId}
        running={running}
        total={containers.length}
        imageCount={images.length}
      />
    </div>
  )
}

// ─── list pane (extracted from the old inline render) ────────────────────

function ListPane({
  tab,
  state,
  busy,
  actionError,
  onClearError,
  lastPolledAt,
  isAnyActionInFlight,
  search,
  onSearch,
  runningOnly,
  onRunningOnlyChange,
  containers,
  filteredContainers,
  filteredImages,
  activity,
  host,
  onOpen,
  onAction,
}: {
  tab: "containers" | "images" | "activity"
  state: LoadState
  busy: string | null
  actionError: string | null
  onClearError: () => void
  lastPolledAt: number | null
  isAnyActionInFlight: boolean
  search: string
  onSearch: (s: string) => void
  runningOnly: boolean
  onRunningOnlyChange: (b: boolean) => void
  containers: ContainerInfo[]
  filteredContainers: ContainerInfo[]
  filteredImages: ImageInfo[]
  activity: ActivityEvent[]
  host: HostInfo | null
  onOpen: (c: ContainerInfo) => void
  onAction: (key: string, command: string) => void
}) {
  // ─── aggregate container CPU / memory for the header ─────────────────
  // Docker Desktop shows sums across running containers on one line, next
  // to the host ceiling. Each logical CPU is 100% in docker stats, so the
  // ceiling is host.cpus * 100. Memory ceiling is the host's total RAM.
  const cpuSum = containers.reduce(
    (acc, c) => acc + (c.stats?.cpuPercent ?? 0),
    0
  )
  const memUsedBytes = containers.reduce(
    (acc, c) => acc + (c.stats ? c.stats.memUsageMB * 1_048_576 : 0),
    0
  )
  const cpuCeiling = host ? host.cpus * 100 : null
  const memCeilingBytes = host ? host.memBytes : null

  const headerTitle =
    tab === "containers"
      ? "Containers"
      : tab === "images"
        ? "Images"
        : "Activity"

  return (
    <div className="flex min-h-0 flex-col">
      {/* page header */}
      <div className="border-b border-border bg-card px-5 pt-4 pb-3">
        {/* title row: title + feedback link (left) / show charts + polled (right) */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-baseline gap-3">
            <h1 className="font-display text-base text-foreground">
              {headerTitle}
            </h1>
            <button
              type="button"
              className="font-mono text-[11px] text-blue-400 hover:text-blue-300 hover:underline"
            >
              Give feedback
            </button>
          </div>
          <div className="flex items-center gap-3 font-mono text-[10px] text-foreground/45">
            {lastPolledAt && <span>updated {relativeTime(lastPolledAt)}</span>}
            {isAnyActionInFlight && (
              <span className="flex items-center gap-1 text-foreground/65">
                <Spinner />
                working…
              </span>
            )}
            <button
              type="button"
              className="flex items-center gap-1 text-blue-400 hover:text-blue-300 hover:underline"
            >
              <ChartIcon />
              Show charts
            </button>
          </div>
        </div>

        {/* inline aggregate stats row — only on containers tab */}
        {tab === "containers" && (
          <div className="mt-3 flex flex-wrap items-center gap-x-8 gap-y-2 font-mono text-[11px]">
            <div className="flex items-baseline gap-2">
              <span className="text-foreground/55">Container CPU usage</span>
              <span className="text-foreground tabular-nums">
                {cpuSum.toFixed(2)}%
              </span>
              {cpuCeiling !== null && (
                <>
                  <span className="text-foreground/35">/</span>
                  <span className="text-foreground/65 tabular-nums">
                    {cpuCeiling}%
                  </span>
                  <span className="text-foreground/45">
                    ({host?.cpus} CPUs available)
                  </span>
                </>
              )}
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-foreground/55">Container memory usage</span>
              <span className="text-foreground tabular-nums">
                {humanBytes(memUsedBytes)}
              </span>
              {memCeilingBytes !== null && (
                <>
                  <span className="text-foreground/35">/</span>
                  <span className="text-foreground/65 tabular-nums">
                    {humanBytes(memCeilingBytes)}
                  </span>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {(tab === "containers" || tab === "images") && (
        <div className="flex items-center gap-3 border-b border-border bg-card px-5 py-2">
          <div className="flex h-7 flex-1 items-center gap-2 rounded-md border border-border bg-surface-sunken px-2.5 font-mono text-[11px]">
            <SearchIcon />
            <input
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder={`search ${tab}…`}
              className="flex-1 bg-transparent text-foreground placeholder:text-foreground/35 outline-none"
            />
            {search && (
              <button
                type="button"
                onClick={() => onSearch("")}
                className="text-foreground/45 hover:text-foreground"
              >
                ×
              </button>
            )}
          </div>
          {tab === "containers" && (
            <label className="flex items-center gap-2 font-mono text-[11px] text-foreground/65">
              <input
                type="checkbox"
                checked={runningOnly}
                onChange={(e) => onRunningOnlyChange(e.target.checked)}
                className="size-3.5 accent-blue-500"
              />
              only running
            </label>
          )}
        </div>
      )}

      {actionError && (
        <div className="border-b border-red-400/30 bg-red-400/10 px-5 py-1.5 font-mono text-[11px] text-red-400/85">
          {actionError}
          <button
            type="button"
            onClick={onClearError}
            className="ml-2 text-red-400/60 hover:text-red-400/85"
          >
            dismiss
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto">
        {state.kind === "loading" && (
          <div className="grid h-full place-items-center font-mono text-[11px] text-foreground/40">
            polling daemon…
          </div>
        )}
        {state.kind === "error" && (
          <div className="px-5 py-4 font-mono text-[11px] text-red-400/85">
            {state.message}
          </div>
        )}
        {state.kind === "ok" && tab === "containers" && (
          <ContainerTable
            containers={filteredContainers}
            busy={busy}
            onOpen={onOpen}
            onStop={(c) => onAction(`stop:${c.name}`, `docker stop ${c.name}`)}
            onStart={(c) =>
              onAction(
                `start:${c.name}`,
                `docker run -d -p 3000:3000 ${c.image}`
              )
            }
            onRemove={(c) =>
              onAction(`rm:${c.name}`, `docker rm -f ${c.name}`)
            }
          />
        )}
        {state.kind === "ok" && tab === "images" && (
          <ImageTable
            images={filteredImages}
            busy={busy}
            onRemove={(i) =>
              onAction(`rmi:${i.repository}`, `docker rmi ${i.repository}`)
            }
          />
        )}
        {state.kind === "ok" && tab === "activity" && (
          <ActivityList events={activity} />
        )}
      </div>
    </div>
  )
}

// ─── docker-style outer chrome ───────────────────────────────────────────

function DockerHeader() {
  return (
    <div className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-surface-sunken px-4">
      {/* whale logo + wordmark + personal badge */}
      <div className="flex items-center gap-2">
        <DockerWhale />
        <div className="font-display text-[15px] tracking-tight text-foreground">
          docker
          <span className="text-foreground/55">.desktop</span>
        </div>
        <span className="rounded-full border border-blue-500/40 bg-blue-500/15 px-1.5 py-0.5 font-mono text-[8px] tracking-widest text-blue-300 uppercase">
          personal
        </span>
      </div>

      {/* search */}
      <div className="mx-auto flex h-7 w-72 items-center gap-2 rounded-md border border-border bg-surface-sunken px-2.5 font-mono text-[11px] text-foreground/55">
        <SearchIcon />
        <span>Search</span>
        <span className="ml-auto rounded border border-border bg-surface-elevated px-1.5 py-0.5 text-[9px] text-foreground/65">
          Ctrl+K
        </span>
      </div>

      {/* right-side toolbar */}
      <div className="flex items-center gap-1 text-foreground/65">
        <button
          type="button"
          title="help"
          className="grid size-7 place-items-center rounded hover:bg-surface-elevated hover:text-foreground"
        >
          <HelpIcon />
        </button>
        <button
          type="button"
          title="notifications"
          className="relative grid size-7 place-items-center rounded hover:bg-surface-elevated hover:text-foreground"
        >
          <BellIcon />
          <span className="absolute top-1 right-1 grid size-3 place-items-center rounded-full bg-red-500 font-mono text-[7px] font-bold text-white">
            7
          </span>
        </button>
        <button
          type="button"
          title="settings"
          className="grid size-7 place-items-center rounded hover:bg-surface-elevated hover:text-foreground"
        >
          <GearIcon />
        </button>
        <div className="grid size-7 place-items-center rounded-full bg-blue-500 text-[10px] font-bold text-white">
          I
        </div>
      </div>
    </div>
  )
}

function DockerFooter({
  connection,
  sessionId,
  running,
  total,
  imageCount,
}: {
  connection: string
  sessionId: string | null
  running: number
  total: number
  imageCount: number
}) {
  // a fake-but-believable resource pill row, like the real Docker Desktop
  // status bar at the bottom. since we don't have host stats, we display
  // session-derived numbers in the same shape.
  return (
    <div className="flex h-7 shrink-0 items-center justify-between border-t border-border bg-surface-sunken px-3 font-mono text-[10px] text-foreground/55">
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1.5">
          <span
            className={cn(
              "size-1.5 rounded-full",
              connection === "open" ? "bg-emerald-400" : "bg-red-400/80"
            )}
          />
          <span className="text-foreground/85">
            Engine {connection === "open" ? "running" : connection}
          </span>
        </span>
        <span className="text-foreground/25">|</span>
        <button
          type="button"
          className="grid size-5 place-items-center rounded hover:bg-surface-elevated hover:text-foreground"
          title="more"
        >
          <DetailsIcon />
        </button>
      </div>
      <div className="flex items-center gap-3">
        {sessionId && (
          <>
            <span className="text-foreground/65">session {sessionId}</span>
            <span className="text-foreground/25">·</span>
          </>
        )}
        <span>
          <span className="text-foreground/85">{running}</span> running
        </span>
        <span className="text-foreground/25">·</span>
        <span>
          <span className="text-foreground/85">{total}</span> containers
        </span>
        <span className="text-foreground/25">·</span>
        <span>
          <span className="text-foreground/85">{imageCount}</span> images
        </span>
        <span className="text-foreground/25">·</span>
        <button
          type="button"
          className="flex items-center gap-1 text-foreground/65 hover:text-foreground"
          title="terminal"
        >
          <TerminalIcon />
          <span>Terminal</span>
        </button>
      </div>
    </div>
  )
}

// ─── stub view for non-functional sidebar items ──────────────────────────

const STUB_LABELS: Partial<Record<Tab, { label: string; description: string }>> = {
  gordon: {
    label: "Gordon",
    description:
      "AI assistant for your Docker workflow. Coming soon to dockerlab.",
  },
  volumes: {
    label: "Volumes",
    description:
      "Browse named volumes attached to your containers. Coming soon.",
  },
  kubernetes: {
    label: "Kubernetes",
    description:
      "The dockerlab daemon doesn't speak Kubernetes — try Docker Desktop on the host for that.",
  },
  builds: {
    label: "Builds",
    description: "Live build history. Coming soon.",
  },
  hub: {
    label: "Docker Hub",
    description: "Browse and pull images from Docker Hub. Coming soon.",
  },
  scout: {
    label: "Docker Scout",
    description:
      "Vulnerability scanning. Available in real Docker Desktop — not in dockerlab.",
  },
  models: {
    label: "Models",
    description: "Run AI models locally. Out of scope for the demo.",
  },
  mcp: {
    label: "MCP Toolkit",
    description: "Model Context Protocol toolkit. Out of scope for the demo.",
  },
  extensions: {
    label: "Extensions",
    description: "Third-party extensions. Out of scope for the demo.",
  },
}

function StubPane({ tab }: { tab: Tab }) {
  const meta = STUB_LABELS[tab]
  return (
    <div className="flex min-h-0 flex-col">
      <div className="border-b border-border bg-card px-5 py-4">
        <h1 className="font-display text-base text-foreground">
          {meta?.label ?? tab}
        </h1>
      </div>
      <div className="grid min-h-0 flex-1 place-items-center px-8">
        <div className="max-w-md text-center">
          <div className="font-display text-2xl text-foreground/40">
            {meta?.label ?? tab}
          </div>
          <p className="mt-3 text-[12px] leading-relaxed text-foreground/55">
            {meta?.description ??
              "This section isn't wired up in dockerlab. The real Docker Desktop has it, but it's out of scope for this demo."}
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── sidebar ─────────────────────────────────────────────────────────────

function Sidebar({
  tab,
  onTab,
  containerCount,
  imageCount,
  activityCount,
}: {
  tab: Tab
  onTab: (t: Tab) => void
  containerCount: number
  imageCount: number
  activityCount: number
}) {
  return (
    <div className="flex min-h-0 flex-col border-r border-border bg-surface-sunken">
      <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2">
        <SidebarLink
          active={tab === "gordon"}
          label="Gordon"
          beta
          onClick={() => onTab("gordon")}
          icon={<GordonIcon />}
        />
        <SidebarLink
          active={tab === "containers"}
          label="Containers"
          count={containerCount}
          onClick={() => onTab("containers")}
          icon={<ContainerIcon />}
        />
        <SidebarLink
          active={tab === "images"}
          label="Images"
          count={imageCount}
          onClick={() => onTab("images")}
          icon={<ImageIcon />}
        />
        <SidebarLink
          active={tab === "volumes"}
          label="Volumes"
          onClick={() => onTab("volumes")}
          icon={<VolumeIcon />}
        />
        <SidebarLink
          active={tab === "kubernetes"}
          label="Kubernetes"
          onClick={() => onTab("kubernetes")}
          icon={<KubernetesIcon />}
        />
        <SidebarLink
          active={tab === "builds"}
          label="Builds"
          onClick={() => onTab("builds")}
          icon={<WrenchIcon />}
        />
        <SidebarLink
          active={tab === "hub"}
          label="Docker Hub"
          onClick={() => onTab("hub")}
          icon={<HubIcon />}
        />
        <SidebarLink
          active={tab === "scout"}
          label="Docker Scout"
          onClick={() => onTab("scout")}
          icon={<ScoutIcon />}
        />
        <SidebarLink
          active={tab === "models"}
          label="Models"
          onClick={() => onTab("models")}
          icon={<ModelsIcon />}
        />
        <SidebarLink
          active={tab === "mcp"}
          label="MCP Toolkit"
          beta
          onClick={() => onTab("mcp")}
          icon={<MCPIcon />}
        />
        <div className="my-1.5 border-t border-border" />
        <SidebarLink
          active={tab === "extensions"}
          label="Extensions"
          onClick={() => onTab("extensions")}
          icon={<ExtensionsIcon />}
        />
        <SidebarLink
          active={tab === "activity"}
          label="Activity"
          count={activityCount}
          onClick={() => onTab("activity")}
          icon={<ActivityIcon />}
        />
      </nav>
      <div className="border-t border-border p-2">
        <button
          type="button"
          className="w-full rounded-md bg-blue-600 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-blue-500"
        >
          Upgrade plan
        </button>
      </div>
    </div>
  )
}

function SidebarLink({
  active,
  label,
  count,
  beta,
  onClick,
  icon,
}: {
  active: boolean
  label: string
  count?: number
  beta?: boolean
  onClick: () => void
  icon: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[12px] transition",
        active
          ? "bg-blue-500/15 text-foreground"
          : "text-foreground/65 hover:bg-surface-elevated hover:text-foreground/90"
      )}
    >
      <span
        className={cn(
          "grid size-5 place-items-center text-foreground/65",
          active && "text-blue-300"
        )}
      >
        {icon}
      </span>
      <span className="flex-1">{label}</span>
      {beta && (
        <span className="rounded-full border border-blue-500/40 bg-blue-500/15 px-1.5 py-0.5 font-mono text-[8px] tracking-widest text-blue-300 uppercase">
          beta
        </span>
      )}
      {count !== undefined && count > 0 && (
        <span className="font-mono text-[10px] text-foreground/40 tabular-nums">
          {count}
        </span>
      )}
    </button>
  )
}

// ─── container table (list view) ─────────────────────────────────────────

function ContainerTable({
  containers,
  busy,
  onOpen,
  onStop,
  onStart,
  onRemove,
}: {
  containers: ContainerInfo[]
  busy: string | null
  onOpen: (c: ContainerInfo) => void
  onStop: (c: ContainerInfo) => void
  onStart: (c: ContainerInfo) => void
  onRemove: (c: ContainerInfo) => void
}) {
  if (containers.length === 0) {
    return (
      <div className="grid h-full place-items-center px-6 text-center font-mono text-[11px] text-foreground/45">
        no containers — try{" "}
        <span className="ml-1 text-foreground/75">docker run …</span>
      </div>
    )
  }
  return (
    <table className="w-full border-separate border-spacing-0 font-mono text-[11px]">
      <thead className="sticky top-0 z-10 bg-card text-foreground/45">
        <tr>
          <Th className="w-6"></Th>
          <Th>Name</Th>
          <Th>Image</Th>
          <Th>Port(s)</Th>
          <Th className="text-right">CPU</Th>
          <Th className="text-right">Memory</Th>
          <Th className="text-right">PIDs</Th>
          <Th>Started</Th>
          <Th className="text-right">Actions</Th>
        </tr>
      </thead>
      <tbody>
        {containers.map((c) => {
          const isRunning = c.state === "running"
          const stopBusy = busy === `stop:${c.name}`
          const rmBusy = busy === `rm:${c.name}`
          const startBusy = busy === `start:${c.name}`
          return (
            <tr
              key={c.rawName}
              onClick={() => onOpen(c)}
              className="cursor-pointer border-b border-border hover:bg-surface-elevated"
            >
              <Td>
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    isRunning
                      ? "bg-emerald-400"
                      : c.state === "exited"
                        ? "bg-foreground/30"
                        : "bg-amber-400/85"
                  )}
                />
              </Td>
              <Td>
                <div className="text-foreground">{c.name}</div>
              </Td>
              <Td className="text-foreground/65">{c.image}</Td>
              <Td className="text-foreground/55">{c.ports || "—"}</Td>
              <Td className="text-right text-foreground/85 tabular-nums">
                {c.stats ? `${c.stats.cpuPercent.toFixed(1)}%` : "—"}
              </Td>
              <Td className="text-right text-foreground/85 tabular-nums">
                {c.stats
                  ? `${c.stats.memUsageMB.toFixed(1)} / ${c.stats.memLimitMB.toFixed(0)} MB`
                  : "—"}
              </Td>
              <Td className="text-right text-foreground/70 tabular-nums">
                {c.stats ? c.stats.pids : "—"}
              </Td>
              <Td className="text-foreground/55">
                {humanizeStatus(c.status)}
              </Td>
              <Td>
                <div
                  className="flex items-center justify-end gap-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  {isRunning ? (
                    <IconAction
                      busy={stopBusy}
                      onClick={() => onStop(c)}
                      title="stop"
                    >
                      <StopIcon />
                    </IconAction>
                  ) : (
                    <IconAction
                      busy={startBusy}
                      onClick={() => onStart(c)}
                      title="start"
                    >
                      <PlayIcon />
                    </IconAction>
                  )}
                  <IconAction
                    busy={false}
                    onClick={() => onOpen(c)}
                    title="details"
                  >
                    <DetailsIcon />
                  </IconAction>
                  <IconAction
                    busy={rmBusy}
                    onClick={() => onRemove(c)}
                    title="remove"
                    danger
                  >
                    <TrashIcon />
                  </IconAction>
                </div>
              </Td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function ImageTable({
  images,
  busy,
  onRemove,
}: {
  images: ImageInfo[]
  busy: string | null
  onRemove: (i: ImageInfo) => void
}) {
  if (images.length === 0) {
    return (
      <div className="grid h-full place-items-center px-6 text-center font-mono text-[11px] text-foreground/45">
        no images — try{" "}
        <span className="ml-1 text-foreground/75">docker build …</span>
      </div>
    )
  }
  return (
    <table className="w-full border-separate border-spacing-0 font-mono text-[11px]">
      <thead className="sticky top-0 z-10 bg-card text-foreground/45">
        <tr>
          <Th>Repository</Th>
          <Th>Tag</Th>
          <Th>Image ID</Th>
          <Th>Size</Th>
          <Th>Created</Th>
          <Th className="text-right">Actions</Th>
        </tr>
      </thead>
      <tbody>
        {images.map((img) => {
          const rmBusy = busy === `rmi:${img.repository}`
          return (
            <tr
              key={img.id || `${img.rawRepository}:${img.tag}`}
              className="border-b border-border hover:bg-surface-elevated"
            >
              <Td className="text-foreground">{img.repository}</Td>
              <Td className="text-foreground/65">{img.tag}</Td>
              <Td className="text-foreground/55">{img.id.slice(0, 12)}</Td>
              <Td className="text-foreground/65">{img.size}</Td>
              <Td className="text-foreground/55">{img.createdAt}</Td>
              <Td>
                <div className="flex items-center justify-end gap-1">
                  <IconAction
                    busy={rmBusy}
                    onClick={() => onRemove(img)}
                    title="remove"
                    danger
                  >
                    <TrashIcon />
                  </IconAction>
                </div>
              </Td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function ActivityList({ events }: { events: ActivityEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="grid h-full place-items-center px-6 text-center font-mono text-[11px] text-foreground/45">
        no activity yet — build, run, or stop a container to see events here
      </div>
    )
  }
  return (
    <ol className="divide-y divide-border">
      {events.map((e) => (
        <li
          key={e.id}
          className="flex items-center gap-3 px-5 py-2 font-mono text-[11px]"
        >
          <span
            className={cn(
              "size-1.5 rounded-full",
              e.kind === "started" || e.kind === "image-built"
                ? "bg-emerald-400"
                : e.kind === "stopped"
                  ? "bg-amber-400/85"
                  : e.kind === "removed" || e.kind === "image-removed"
                    ? "bg-red-400/85"
                    : "bg-blue-400"
            )}
          />
          <span className="text-foreground/45 tabular-nums">
            {formatClockTime(e.at)}
          </span>
          <span className="text-foreground/65">{e.kind.replace("-", " ")}</span>
          <span className="text-foreground">{e.target}</span>
          {e.detail && (
            <span className="text-foreground/45">{e.detail}</span>
          )}
        </li>
      ))}
    </ol>
  )
}

// ─── detail view (shell) ─────────────────────────────────────────────────

type DetailTab = "logs" | "exec" | "files" | "stats"

function ContainerDetail({
  container,
  onBack,
  busy,
  actionError,
  onClearError,
  onAction,
}: {
  container: ContainerInfo
  onBack: () => void
  busy: string | null
  actionError: string | null
  onClearError: () => void
  onAction: (key: string, command: string) => void
}) {
  const [tab, setTab] = React.useState<DetailTab>("logs")
  const isRunning = container.state === "running"

  return (
    <div className="row-span-1 flex min-h-0 flex-col">
      {/* breadcrumb + header */}
      <div className="border-b border-border bg-card px-5 py-3">
        <div className="flex items-center gap-1 font-mono text-[10px] text-foreground/45">
          <button
            type="button"
            onClick={onBack}
            className="hover:text-foreground"
          >
            Containers
          </button>
          <span>/</span>
          <span className="text-foreground/75">{container.name}</span>
        </div>

        <div className="mt-2 flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <button
              type="button"
              onClick={onBack}
              className="grid size-6 shrink-0 place-items-center rounded-md text-foreground/55 hover:bg-surface-elevated hover:text-foreground"
              title="back to containers"
            >
              <ChevronLeftIcon />
            </button>
            <div
              className="grid size-9 shrink-0 place-items-center rounded-md border border-border"
              style={{
                background:
                  "linear-gradient(180deg, oklch(0.22 0 0 / 0.15), oklch(0.16 0 0 / 0.1))",
              }}
            >
              <ContainerIcon />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-lg text-foreground">
                {container.name}
              </h1>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[10px] text-foreground/55">
                <span className="inline-flex items-center gap-1">
                  <HashIcon />
                  <span>
                    {container.rawName.slice(0, 12) || "—"}
                  </span>
                </span>
                <span className="inline-flex items-center gap-1">
                  <ImageIcon />
                  <span className="text-foreground/75">{container.image}</span>
                </span>
                {container.ports && (
                  <span className="inline-flex items-center gap-1 text-foreground/75">
                    {container.ports}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <div className="text-right">
              <div className="font-mono text-[9px] tracking-widest text-foreground/45 uppercase">
                status
              </div>
              <div
                className={cn(
                  "mt-0.5 flex items-center gap-1.5 text-[12px]",
                  isRunning ? "text-emerald-400" : "text-foreground/70"
                )}
              >
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    isRunning ? "bg-emerald-400" : "bg-foreground/30"
                  )}
                />
                {container.state}
                <span className="text-foreground/45">
                  {humanizeStatus(container.status)}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {isRunning ? (
                <IconAction
                  busy={busy === `stop:${container.name}`}
                  onClick={() =>
                    onAction(
                      `stop:${container.name}`,
                      `docker stop ${container.name}`
                    )
                  }
                  title="stop"
                  size="lg"
                >
                  <StopIcon />
                </IconAction>
              ) : (
                <IconAction
                  busy={busy === `start:${container.name}`}
                  onClick={() =>
                    onAction(
                      `start:${container.name}`,
                      `docker run -d -p 3000:3000 ${container.image}`
                    )
                  }
                  title="start"
                  size="lg"
                >
                  <PlayIcon />
                </IconAction>
              )}
              <IconAction
                busy={false}
                onClick={() => {
                  // restart = stop then the list polls and shows it stopped;
                  // the user clicks start again. we don't have a direct
                  // docker restart template, so simulate with stop.
                  onAction(
                    `stop:${container.name}`,
                    `docker stop ${container.name}`
                  )
                }}
                title="restart"
                size="lg"
              >
                <RestartIcon />
              </IconAction>
              <IconAction
                busy={busy === `rm:${container.name}`}
                onClick={() =>
                  onAction(
                    `rm:${container.name}`,
                    `docker rm -f ${container.name}`
                  )
                }
                title="remove"
                danger
                size="lg"
              >
                <TrashIcon />
              </IconAction>
            </div>
          </div>
        </div>

        {/* tabs */}
        <div className="mt-3 flex items-center gap-1 border-b border-border">
          <DetailTabButton
            active={tab === "logs"}
            onClick={() => setTab("logs")}
            label="Logs"
          />
          <DetailTabButton
            active={tab === "exec"}
            onClick={() => setTab("exec")}
            label="Exec"
          />
          <DetailTabButton
            active={tab === "files"}
            onClick={() => setTab("files")}
            label="Files"
          />
          <DetailTabButton
            active={tab === "stats"}
            onClick={() => setTab("stats")}
            label="Stats"
          />
        </div>
      </div>

      {actionError && (
        <div className="border-b border-red-400/30 bg-red-400/10 px-5 py-1.5 font-mono text-[11px] text-red-400/85">
          {actionError}
          <button
            type="button"
            onClick={onClearError}
            className="ml-2 text-red-400/60 hover:text-red-400/85"
          >
            dismiss
          </button>
        </div>
      )}

      {/* tab body */}
      <div className="min-h-0 flex-1">
        {tab === "logs" && <LogsTab key={container.rawName} container={container} />}
        {tab === "exec" && <ExecTab key={container.rawName} container={container} />}
        {tab === "files" && <FilesTab key={container.rawName} container={container} />}
        {tab === "stats" && <StatsTab key={container.rawName} container={container} />}
      </div>
    </div>
  )
}

function DetailTabButton({
  active,
  onClick,
  label,
}: {
  active: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "border-b-2 px-3 py-1.5 font-mono text-[11px] transition",
        active
          ? "border-blue-500 text-foreground"
          : "border-transparent text-foreground/55 hover:text-foreground/85"
      )}
    >
      {label}
    </button>
  )
}

// ─── Logs tab ────────────────────────────────────────────────────────────

function LogsTab({ container }: { container: ContainerInfo }) {
  const daemon = useDaemon()
  const [lines, setLines] = React.useState<
    Array<{ stream: "stdout" | "stderr"; text: string; id: number }>
  >([])
  const [following, setFollowing] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const abortRef = React.useRef<AbortController | null>(null)
  const counterRef = React.useRef(0)
  const scrollRef = React.useRef<HTMLDivElement>(null)

  const appendChunks = (text: string, stream: "stdout" | "stderr") => {
    const parts = text.split("\n")
    if (parts[parts.length - 1] === "") parts.pop()
    if (parts.length === 0) return
    setLines((cur) => [
      ...cur,
      ...parts.map((t) => ({
        stream,
        text: t,
        id: ++counterRef.current,
      })),
    ])
  }

  const runLogs = async (follow: boolean) => {
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    setBusy(true)
    setFollowing(follow)
    const cmd = follow
      ? `docker logs -f ${container.name}`
      : `docker logs ${container.name}`
    const result = await daemon.run(
      cmd,
      "",
      ({ stream, text }) => appendChunks(text, stream),
      ac.signal
    )
    if (abortRef.current === ac) {
      abortRef.current = null
      setBusy(false)
      setFollowing(false)
    }
    if (result.status === "rejected" || result.status === "error") {
      const msg =
        result.status === "rejected" ? result.reason : result.message
      appendChunks(`\n[${msg}]\n`, "stderr")
    }
  }

  // fetch logs on first mount (non-follow)
  React.useEffect(() => {
    setLines([])
    runLogs(false)
    return () => {
      abortRef.current?.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // auto-scroll on new lines
  React.useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
    })
  }, [lines])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-border bg-surface-sunken px-4 py-1.5 font-mono text-[10px] text-foreground/55">
        <div className="flex items-center gap-2">
          <span>docker logs {container.name}</span>
          {following && (
            <span className="text-emerald-400">· following</span>
          )}
          {busy && !following && <Spinner />}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setLines([])}
            className="rounded border border-border px-2 py-0.5 text-foreground/70 hover:border-foreground/30 hover:text-foreground"
          >
            clear
          </button>
          {following ? (
            <button
              type="button"
              onClick={() => abortRef.current?.abort()}
              className="rounded border border-red-400/30 bg-red-400/10 px-2 py-0.5 text-red-300/85 hover:bg-red-400/20"
            >
              stop
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  setLines([])
                  runLogs(false)
                }}
                disabled={busy}
                className="rounded border border-border px-2 py-0.5 text-foreground/70 hover:border-foreground/30 hover:text-foreground disabled:opacity-50"
              >
                refresh
              </button>
              <button
                type="button"
                onClick={() => {
                  setLines([])
                  runLogs(true)
                }}
                disabled={busy}
                className="rounded border border-border bg-surface-elevated px-2 py-0.5 text-foreground hover:bg-surface-elevated disabled:opacity-50"
              >
                follow
              </button>
            </>
          )}
        </div>
      </div>
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-auto"
        style={{ background: "oklch(0.10 0 0)" }}
      >
        <div className="whitespace-pre-wrap px-4 py-3 font-mono text-[12px] leading-relaxed">
          {lines.length === 0 && !busy && (
            <span className="text-white/40">(empty)</span>
          )}
          {lines.map((l) => (
            <div
              key={l.id}
              className={
                l.stream === "stderr"
                  ? "text-amber-300/85"
                  : "text-white/85"
              }
            >
              {l.text}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Exec tab ────────────────────────────────────────────────────────────

type ExecEntry = {
  id: number
  command: string
  stdout: string
  stderr: string
  exitCode: number | null // null = pending
}

function ExecTab({ container }: { container: ContainerInfo }) {
  const daemon = useDaemon()
  const [input, setInput] = React.useState("")
  const [history, setHistory] = React.useState<ExecEntry[]>([])
  const [busy, setBusy] = React.useState(false)
  const counterRef = React.useRef(0)
  const scrollRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    })
  }, [history])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const cmd = input.trim()
    if (!cmd || busy) return
    setInput("")
    const id = ++counterRef.current
    setHistory((cur) => [
      ...cur,
      { id, command: cmd, stdout: "", stderr: "", exitCode: null },
    ])
    setBusy(true)
    const res = await daemon.containerExec(container.rawName, cmd)
    setBusy(false)
    if (res.ok) {
      setHistory((cur) =>
        cur.map((e) =>
          e.id === id
            ? {
                ...e,
                stdout: res.stdout,
                stderr: res.stderr,
                exitCode: res.exitCode,
              }
            : e
        )
      )
    } else {
      setHistory((cur) =>
        cur.map((e) =>
          e.id === id
            ? { ...e, stderr: res.error, exitCode: -1 }
            : e
        )
      )
    }
  }

  const isRunning = container.state === "running"

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-border bg-surface-sunken px-4 py-1.5 font-mono text-[10px] text-foreground/55">
        <div>docker exec {container.name} sh -c …</div>
        {!isRunning && (
          <div className="text-amber-400/85">
            container is not running — exec will fail
          </div>
        )}
      </div>
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-auto"
        style={{ background: "oklch(0.10 0 0)" }}
      >
        <div className="px-4 py-3 font-mono text-[12px]">
          {history.length === 0 && (
            <div className="text-white/40">
              type a command below and press Enter. examples: <br />
              <span className="text-white/65">ls -la /app</span> · <span className="text-white/65">ps aux</span> · <span className="text-white/65">cat /etc/os-release</span>
            </div>
          )}
          {history.map((e) => (
            <div key={e.id} className="mb-3">
              <div className="text-white">
                <span className="text-emerald-300">$</span> {e.command}
              </div>
              {e.stdout && (
                <pre className="whitespace-pre-wrap text-white/85">
                  {e.stdout}
                </pre>
              )}
              {e.stderr && (
                <pre className="whitespace-pre-wrap text-amber-300/85">
                  {e.stderr}
                </pre>
              )}
              {e.exitCode === null ? (
                <div className="text-white/40">running…</div>
              ) : e.exitCode !== 0 ? (
                <div className="text-amber-300/60">exit {e.exitCode}</div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
      <form
        onSubmit={submit}
        className="flex items-center gap-2 border-t border-border bg-surface-sunken px-4 py-2 font-mono text-[12px]"
      >
        <span className="text-emerald-300">$</span>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={isRunning ? "run a command…" : "container not running"}
          disabled={!isRunning || busy}
          autoFocus
          spellCheck={false}
          className="flex-1 bg-transparent text-foreground placeholder:text-foreground/35 outline-none disabled:opacity-50"
        />
        {busy && <Spinner />}
      </form>
    </div>
  )
}

// ─── Files tab ───────────────────────────────────────────────────────────

function FilesTab({ container }: { container: ContainerInfo }) {
  const daemon = useDaemon()
  const [path, setPath] = React.useState("/")
  const [state, setState] = React.useState<
    | { kind: "loading" }
    | { kind: "ok"; entries: ContainerFileEntry[] }
    | { kind: "error"; message: string }
  >({ kind: "loading" })

  const load = React.useCallback(
    async (targetPath: string) => {
      setState({ kind: "loading" })
      const res = await daemon.containerLs(container.rawName, targetPath)
      if (!res.ok) {
        setState({ kind: "error", message: res.error })
        return
      }
      setState({ kind: "ok", entries: res.entries })
      setPath(res.path)
    },
    [daemon, container.rawName]
  )

  React.useEffect(() => {
    load("/")
  }, [load])

  const navigate = (entry: ContainerFileEntry) => {
    if (entry.kind === "dir") {
      const next =
        path.endsWith("/") ? path + entry.name : path + "/" + entry.name
      load(next)
    }
  }

  const goUp = () => {
    if (path === "/" || path === "") return
    const parts = path.split("/").filter(Boolean)
    parts.pop()
    load("/" + parts.join("/"))
  }

  const isRunning = container.state === "running"

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-border bg-surface-sunken px-4 py-1.5 font-mono text-[10px] text-foreground/55">
        <button
          type="button"
          onClick={goUp}
          disabled={path === "/"}
          className="rounded border border-border px-2 py-0.5 text-foreground/70 hover:border-foreground/30 hover:text-foreground disabled:opacity-40"
        >
          ↑ up
        </button>
        <button
          type="button"
          onClick={() => load(path)}
          className="rounded border border-border px-2 py-0.5 text-foreground/70 hover:border-foreground/30 hover:text-foreground"
        >
          refresh
        </button>
        <span className="truncate text-foreground/75">{path}</span>
        {!isRunning && (
          <span className="ml-auto text-amber-400/85">
            container not running
          </span>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {state.kind === "loading" && (
          <div className="grid h-full place-items-center font-mono text-[11px] text-foreground/40">
            loading…
          </div>
        )}
        {state.kind === "error" && (
          <div className="px-4 py-3 font-mono text-[11px] text-red-400/85">
            {state.message}
          </div>
        )}
        {state.kind === "ok" && state.entries.length === 0 && (
          <div className="grid h-full place-items-center font-mono text-[11px] text-foreground/40">
            empty directory
          </div>
        )}
        {state.kind === "ok" && state.entries.length > 0 && (
          <table className="w-full border-separate border-spacing-0 font-mono text-[11px]">
            <thead className="sticky top-0 bg-card text-foreground/45">
              <tr>
                <Th>Name</Th>
                <Th className="text-right">Size</Th>
                <Th>Modified</Th>
                <Th>Mode</Th>
              </tr>
            </thead>
            <tbody>
              {state.entries.map((entry) => {
                const isDir = entry.kind === "dir"
                return (
                  <tr
                    key={entry.name}
                    onClick={() => navigate(entry)}
                    className={cn(
                      "border-b border-border",
                      isDir && "cursor-pointer hover:bg-surface-elevated"
                    )}
                  >
                    <Td>
                      <div className="flex items-center gap-2">
                        <span className="text-foreground/55">
                          {entry.kind === "dir"
                            ? "📁"
                            : entry.kind === "link"
                              ? "🔗"
                              : "·"}
                        </span>
                        <span
                          className={cn(
                            isDir
                              ? "text-blue-300"
                              : entry.kind === "link"
                                ? "text-cyan-300/85"
                                : "text-foreground"
                          )}
                        >
                          {entry.name}
                          {entry.kind === "link" && entry.target && (
                            <span className="text-foreground/45">
                              {" → "}
                              {entry.target}
                            </span>
                          )}
                        </span>
                      </div>
                    </Td>
                    <Td className="text-right text-foreground/55 tabular-nums">
                      {isDir ? "—" : humanBytes(entry.size)}
                    </Td>
                    <Td className="text-foreground/55">{entry.modified}</Td>
                    <Td className="text-foreground/45">{entry.mode}</Td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ─── Stats tab ───────────────────────────────────────────────────────────

function StatsTab({ container }: { container: ContainerInfo }) {
  const daemon = useDaemon()
  const [history, setHistory] = React.useState<ContainerStatsSample[]>([])
  const [error, setError] = React.useState<string | null>(null)
  const isRunning = container.state === "running"

  React.useEffect(() => {
    if (!isRunning) return
    let cancelled = false

    const tick = async () => {
      const res = await daemon.getContainerStats(container.rawName)
      if (cancelled) return
      if (!res.ok) {
        setError(res.error)
        return
      }
      setError(null)
      if (res.sample) {
        setHistory((cur) => [...cur, res.sample!].slice(-STATS_WINDOW))
      }
    }

    tick()
    const id = window.setInterval(tick, STATS_POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [daemon, container.rawName, isRunning])

  if (!isRunning) {
    return (
      <div className="grid h-full place-items-center px-6 text-center font-mono text-[11px] text-foreground/45">
        container is not running — stats are only available when running
      </div>
    )
  }

  const latest = history[history.length - 1]

  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-2 gap-px overflow-auto bg-border">
        <Chart
          title="CPU usage"
          value={latest ? `${latest.cpuPercent.toFixed(2)}%` : "—"}
          series={history.map((s) => s.cpuPercent)}
          maxHint={Math.max(10, ...history.map((s) => s.cpuPercent))}
          unit="%"
          color="oklch(0.78 0.16 60)"
        />
        <Chart
          title="Memory usage"
          value={
            latest
              ? `${latest.memUsageMB.toFixed(1)} / ${latest.memLimitMB.toFixed(0)} MB`
              : "—"
          }
          series={history.map((s) => s.memUsageMB)}
          maxHint={latest?.memLimitMB ?? 100}
          unit=" MB"
          color="oklch(0.7 0.14 200)"
        />
        <Chart
          title="Disk read / write"
          value={
            latest
              ? `${humanBytes(latest.blockReadBytes)} / ${humanBytes(latest.blockWriteBytes)}`
              : "—"
          }
          series={history.map((s) => s.blockReadBytes / 1024)}
          series2={history.map((s) => s.blockWriteBytes / 1024)}
          maxHint={Math.max(
            1,
            ...history.map((s) =>
              Math.max(s.blockReadBytes, s.blockWriteBytes)
            )
          ) / 1024}
          unit=" KB"
          color="oklch(0.78 0.16 60)"
          color2="oklch(0.7 0.14 30)"
        />
        <Chart
          title="Network I/O"
          value={
            latest
              ? `${humanBytes(latest.netRxBytes)} / ${humanBytes(latest.netTxBytes)}`
              : "—"
          }
          series={history.map((s) => s.netRxBytes / 1024)}
          series2={history.map((s) => s.netTxBytes / 1024)}
          maxHint={
            Math.max(
              1,
              ...history.map((s) => Math.max(s.netRxBytes, s.netTxBytes))
            ) / 1024
          }
          unit=" KB"
          color="oklch(0.7 0.14 200)"
          color2="oklch(0.78 0.16 60)"
        />
      </div>
      {error && (
        <div className="border-t border-red-400/30 bg-red-400/10 px-5 py-1.5 font-mono text-[11px] text-red-400/85">
          stats error: {error}
        </div>
      )}
    </div>
  )
}

// simple SVG line chart, takes one or two series and auto-scales y-axis
function Chart({
  title,
  value,
  series,
  series2,
  maxHint,
  unit,
  color,
  color2,
}: {
  title: string
  value: string
  series: number[]
  series2?: number[]
  maxHint: number
  unit: string
  color: string
  color2?: string
}) {
  const W = 400
  const H = 180
  const padX = 28
  const padY = 22
  const innerW = W - padX * 2
  const innerH = H - padY * 2

  const max = Math.max(
    maxHint,
    ...series,
    ...(series2 ?? []),
    1
  )

  const toPath = (arr: number[]) => {
    if (arr.length === 0) return ""
    const step = arr.length > 1 ? innerW / (arr.length - 1) : 0
    return arr
      .map((v, i) => {
        const x = padX + i * step
        const y = padY + innerH - (v / max) * innerH
        return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`
      })
      .join(" ")
  }

  // 5 gridlines
  const gridY = [0, 0.25, 0.5, 0.75, 1].map((f) => padY + innerH * f)

  return (
    <div className="flex flex-col bg-card p-4">
      <div className="flex items-baseline justify-between">
        <div className="font-mono text-[10px] tracking-widest text-foreground/45 uppercase">
          {title}
        </div>
        <div className="font-mono text-[11px] text-foreground/85">{value}</div>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="mt-2 w-full flex-1"
        style={{ minHeight: 140 }}
      >
        {/* gridlines */}
        {gridY.map((y, i) => (
          <line
            key={i}
            x1={padX}
            x2={W - padX}
            y1={y}
            y2={y}
            stroke="oklch(1 0 0 / 0.08)"
            strokeWidth="0.5"
          />
        ))}
        {/* y-axis max label */}
        <text
          x={padX - 4}
          y={padY + 4}
          fontSize="9"
          fill="oklch(1 0 0 / 0.4)"
          textAnchor="end"
          fontFamily="ui-monospace, monospace"
        >
          {max.toFixed(max >= 100 ? 0 : 2)}
          {unit}
        </text>
        <text
          x={padX - 4}
          y={padY + innerH}
          fontSize="9"
          fill="oklch(1 0 0 / 0.4)"
          textAnchor="end"
          fontFamily="ui-monospace, monospace"
        >
          0
        </text>
        {/* series 2 first (so primary is on top) */}
        {series2 && (
          <path
            d={toPath(series2)}
            fill="none"
            stroke={color2 ?? color}
            strokeWidth="1.5"
            strokeLinejoin="round"
            strokeLinecap="round"
            opacity="0.7"
          />
        )}
        <path
          d={toPath(series)}
          fill="none"
          stroke={color}
          strokeWidth="1.75"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
      {series2 && (
        <div className="mt-1 flex items-center gap-3 font-mono text-[9px] text-foreground/55">
          <span className="flex items-center gap-1">
            <span
              className="size-2 rounded-sm"
              style={{ background: color }}
            />
            primary
          </span>
          <span className="flex items-center gap-1">
            <span
              className="size-2 rounded-sm"
              style={{ background: color2 ?? color }}
            />
            secondary
          </span>
        </div>
      )}
    </div>
  )
}

// ─── primitives ──────────────────────────────────────────────────────────

function Th({
  className,
  children,
}: {
  className?: string
  children?: React.ReactNode
}) {
  return (
    <th
      className={cn(
        "border-b border-border px-3 py-2 text-left text-[10px] tracking-wider font-medium uppercase",
        className
      )}
    >
      {children}
    </th>
  )
}

function Td({
  className,
  children,
}: {
  className?: string
  children?: React.ReactNode
}) {
  return (
    <td className={cn("px-3 py-2 align-middle", className)}>{children}</td>
  )
}

function IconAction({
  busy,
  danger,
  children,
  onClick,
  title,
  size = "sm",
}: {
  busy: boolean
  danger?: boolean
  children: React.ReactNode
  onClick: () => void
  title?: string
  size?: "sm" | "lg"
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      title={title}
      aria-label={title}
      className={cn(
        "grid place-items-center rounded border transition disabled:opacity-50",
        size === "sm" ? "size-6" : "size-7",
        danger
          ? "border-red-400/30 bg-red-400/10 text-red-300/85 hover:bg-red-400/20"
          : "border-border bg-transparent text-foreground/70 hover:border-foreground/30 hover:bg-surface-elevated hover:text-foreground"
      )}
    >
      {busy ? <Spinner /> : children}
    </button>
  )
}

function Spinner() {
  return (
    <span className="inline-block size-2.5 animate-spin rounded-full border border-foreground/30 border-t-foreground/85" />
  )
}

// ─── icons ───────────────────────────────────────────────────────────────

const ICON_PROPS = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className: "size-3.5",
}

function ContainerIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M3 7v10l9 4 9-4V7l-9-4-9 4Z" />
      <path d="m3 7 9 4 9-4M12 11v10" />
    </svg>
  )
}
function ImageIcon() {
  return (
    <svg {...ICON_PROPS}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-5-5L5 21" />
    </svg>
  )
}
function ActivityIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M3 12h4l3-9 4 18 3-9h4" />
    </svg>
  )
}
function SearchIcon() {
  return (
    <svg {...ICON_PROPS} className="size-3.5 text-foreground/45">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  )
}
function ChartIcon() {
  return (
    <svg {...ICON_PROPS} className="size-3.5">
      <path d="M3 3v18h18" />
      <path d="m7 14 4-4 3 3 5-6" />
    </svg>
  )
}
function StopIcon() {
  return (
    <svg {...ICON_PROPS}>
      <rect x="6" y="6" width="12" height="12" rx="1" fill="currentColor" />
    </svg>
  )
}
function PlayIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M6 4v16l14-8L6 4Z" fill="currentColor" />
    </svg>
  )
}
function RestartIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M3 12a9 9 0 0 1 15.5-6.3L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15.5 6.3L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  )
}
function TrashIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M4 7h16" />
      <path d="M10 11v6M14 11v6" />
      <path d="M6 7V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2" />
      <path d="M6 7v13a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7" />
    </svg>
  )
}
function DetailsIcon() {
  return (
    <svg {...ICON_PROPS}>
      <circle cx="5" cy="12" r="1" fill="currentColor" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
      <circle cx="19" cy="12" r="1" fill="currentColor" />
    </svg>
  )
}
function ChevronLeftIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="m15 18-6-6 6-6" />
    </svg>
  )
}
function HashIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18" />
    </svg>
  )
}
function HelpIcon() {
  return (
    <svg {...ICON_PROPS} className="size-4">
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.7M12 17h.01" />
    </svg>
  )
}
function BellIcon() {
  return (
    <svg {...ICON_PROPS} className="size-4">
      <path d="M6 10a6 6 0 1 1 12 0c0 4 2 5 2 7H4c0-2 2-3 2-7Z" />
      <path d="M10 21a2 2 0 0 0 4 0" />
    </svg>
  )
}
function GearIcon() {
  return (
    <svg {...ICON_PROPS} className="size-4">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </svg>
  )
}
function TerminalIcon() {
  return (
    <svg {...ICON_PROPS} className="size-3">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="m7 9 3 3-3 3M13 15h4" />
    </svg>
  )
}
function GordonIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M12 3a9 9 0 0 0-9 9v3a3 3 0 0 0 3 3h0a3 3 0 0 0 3-3v-3M21 15v-3a9 9 0 0 0-9-9M21 15a3 3 0 0 1-3 3h0a3 3 0 0 1-3-3v-3" />
    </svg>
  )
}
function VolumeIcon() {
  return (
    <svg {...ICON_PROPS}>
      <ellipse cx="12" cy="6" rx="8" ry="3" />
      <path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6" />
      <path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
    </svg>
  )
}
function KubernetesIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="m12 2 9 5v10l-9 5-9-5V7Z" />
      <path d="M12 2v5M12 17v5M3 7l9 5M21 7l-9 5" />
    </svg>
  )
}
function WrenchIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M14 6a4 4 0 1 1-4 4l-7 7 3 3 7-7a4 4 0 0 1 1-7Z" />
    </svg>
  )
}
function HubIcon() {
  return (
    <svg {...ICON_PROPS}>
      <rect x="3" y="9" width="18" height="9" rx="1" />
      <path d="M6 9V6h3v3M11 9V4h3v5M16 9V7h3v2" />
    </svg>
  )
}
function ScoutIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M12 2 4 6v6c0 5 3.5 9 8 10 4.5-1 8-5 8-10V6l-8-4Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  )
}
function ModelsIcon() {
  return (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="12" r="3" />
      <circle cx="6" cy="6" r="2" />
      <circle cx="18" cy="6" r="2" />
      <circle cx="6" cy="18" r="2" />
      <circle cx="18" cy="18" r="2" />
      <path d="M8 6h2M14 6h2M8 18h2M14 18h2M6 8v2M6 14v2M18 8v2M18 14v2" />
    </svg>
  )
}
function MCPIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M3 12h6M15 12h6M9 8v8M15 8v8" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  )
}
function ExtensionsIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M14 4h-1a2 2 0 1 0 0 4h1v3h-3a2 2 0 1 0 0 4h3v3h3a2 2 0 1 1 0 4h-3v-3" />
    </svg>
  )
}
// the docker whale, traced from the official mark with simple paths
function DockerWhale() {
  return (
    <svg
      viewBox="0 0 32 32"
      className="size-7 shrink-0"
      fill="none"
    >
      <rect x="3" y="13" width="3" height="3" rx="0.4" fill="oklch(0.78 0.16 220)" />
      <rect x="6.5" y="13" width="3" height="3" rx="0.4" fill="oklch(0.78 0.16 220)" />
      <rect x="10" y="13" width="3" height="3" rx="0.4" fill="oklch(0.78 0.16 220)" />
      <rect x="13.5" y="13" width="3" height="3" rx="0.4" fill="oklch(0.78 0.16 220)" />
      <rect x="6.5" y="9.5" width="3" height="3" rx="0.4" fill="oklch(0.78 0.16 220)" />
      <rect x="10" y="9.5" width="3" height="3" rx="0.4" fill="oklch(0.78 0.16 220)" />
      <rect x="13.5" y="9.5" width="3" height="3" rx="0.4" fill="oklch(0.78 0.16 220)" />
      <rect x="10" y="6" width="3" height="3" rx="0.4" fill="oklch(0.78 0.16 220)" />
      <path
        d="M30 16c-1-1-2-1-3 0-1-2-3-3-5-2 0 0 0 3 2 4-1 1-3 1-5 1H2c0 4 3 7 8 7 6 0 11-2 14-6 1-1 4-1 6-3 0 0-1-1 0-1Z"
        fill="oklch(0.55 0.17 230)"
      />
    </svg>
  )
}

// ─── helpers ─────────────────────────────────────────────────────────────

function relativeTime(at: number): string {
  const diff = Date.now() - at
  if (diff < 5_000) return "just now"
  if (diff < 60_000) return `${Math.round(diff / 1000)}s ago`
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`
  return `${Math.round(diff / 3_600_000)}h ago`
}

function formatClockTime(at: number): string {
  const d = new Date(at)
  return d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

function humanizeStatus(status: string): string {
  if (!status) return ""
  if (status.startsWith("Up ")) return `· ${status.slice(3).toLowerCase()}`
  if (status.startsWith("Exited ")) {
    const m = status.match(/Exited \(\d+\) (.+)/)
    return m ? `· ${m[1].toLowerCase()}` : `· ${status.toLowerCase()}`
  }
  return `· ${status.toLowerCase()}`
}

function humanBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1_073_741_824) return `${(bytes / 1_048_576).toFixed(1)} MB`
  return `${(bytes / 1_073_741_824).toFixed(1)} GB`
}
