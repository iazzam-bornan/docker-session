# dockerlab — Project Summary

## What this is

A live, browser-based Docker learning environment built specifically for an
**internal company demo session** (~10–15 colleagues, 60 minutes). Instead of
slides + a recorded terminal, every attendee gets a real, isolated Docker
workspace running on the presenter's machine — accessible from any browser,
no installs, no setup.

The session itself is scripted in [plan.md](plan.md) and [script.md](script.md).
dockerlab is the live demo surface for that talk.

## Why it exists

The original idea was: "I'm giving a Docker talk, I want it to be hands-on,
not theoretical." The naive version (everyone installs Docker beforehand) is a
non-starter for a 60-minute slot. The dockerlab version is: open a URL, you're
inside a desktop-OS-in-the-browser that already has a project, a terminal, a
file editor, and a Docker dashboard. You type real commands, they run on the
presenter's Docker daemon, you see real containers come up.

## Architecture

Monorepo at [docker-workspaces/](docker-workspaces/) using **bun + turbo**:

| Package                                                          | Purpose                                                                              |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| [apps/server](docker-workspaces/apps/server)                     | Bun WebSocket backend that runs real `docker` commands per-session                   |
| [apps/web](docker-workspaces/apps/web)                           | React 19 + Tailwind v4 frontend — the OS-in-the-browser                              |
| [packages/protocol](docker-workspaces/packages/protocol)         | Shared TypeScript discriminated unions for every websocket message                   |
| [packages/ui](docker-workspaces/packages/ui)                     | Shared shadcn-style UI primitives                                                    |

### How isolation works

- Every connected user gets a **session** with a random `sessionId`
- Every Docker artifact created during that session gets a `<sessionId>-`
  **name prefix** AND a `--label session=<sessionId>`
- Each session gets a 10-port slice from `30000+` for `-p` mappings, so
  attendees never collide
- On disconnect, a 90-second **grace period** runs, then `docker rm -f` wipes
  everything labeled with that session — reconnects within 90s cancel cleanup
- Workspaces live on disk under
  `apps/server/workspaces/<sessionId>/greeter-api/`

### Security model

- **No shell interpolation**. User commands are matched against a registry of
  regex templates (`docker run`, `docker build`, …) and the args fed to
  `Bun.spawn` are reconstructed from constants. There is no `sh -c`, so command
  injection isn't possible.
- File paths from the client are **containment-checked** against the workspace
  root before any read/write — no `../../../etc/passwd`.
- Container ops (`exec`, `ls`, `stats`) are gated by `ownsContainer(session, name)`
  which checks the session prefix before doing anything.

## What's done

### Backend ([apps/server/src](docker-workspaces/apps/server/src))

- `Bun.serve` with `/ws` websocket route + CORS + `/_health`, `/_debug`, `/search`, `/reader`
- Per-user **session lifecycle** with grace-period cleanup ([cleanup.ts](docker-workspaces/apps/server/src/cleanup.ts), [session.ts](docker-workspaces/apps/server/src/session.ts))
- **Template-driven** docker command parsing — `build`, `run`, `stop`, `rm`, `ps`, `images`, `logs`, `stats`, `exec` ([templates.ts](docker-workspaces/apps/server/src/templates.ts))
- Streaming command executor with cancellation via `AbortController` ([executor.ts](docker-workspaces/apps/server/src/executor.ts))
- **File r/w** (`listDir`, `readFile`, `writeFile`) with path containment ([files.ts](docker-workspaces/apps/server/src/files.ts))
- **Container ops** — `containerLs`, `containerExec`, `getAllStats`, `getContainerStats` with multi-format `ls` parser for busybox vs GNU ([container-ops.ts](docker-workspaces/apps/server/src/container-ops.ts))
- **Search proxy** — Wikipedia OpenSearch API + reader-mode HTML rewriter for arbitrary URLs ([search.ts](docker-workspaces/apps/server/src/search.ts), [reader.ts](docker-workspaces/apps/server/src/reader.ts))
- Per-session port pool + workspace cloning ([workspace.ts](docker-workspaces/apps/server/src/workspace.ts))
- **Host info** (`cpus`, `memBytes`) advertised in the hello reply

### Frontend — desktop shell

- [Login screen](docker-workspaces/apps/web/src/screens/login-screen.tsx) with username + matrix-rain backdrop
- [Desktop](docker-workspaces/apps/web/src/screens/desktop.tsx) with wallpaper, top bar, dock, draggable + grid-snapping desktop icons
- **Dark + light theme** with semantic Tailwind tokens (`bg-card`, `text-foreground`, `--surface-glass`…) — [appearance.tsx](docker-workspaces/apps/web/src/state/appearance.tsx)
- Quick settings tray (theme toggle, wifi/bluetooth-style buttons)
- **Window manager** ([windows.tsx](docker-workspaces/apps/web/src/state/windows.tsx)): drag to move, double-click to maximize, minimize, close
- **8-handle window resize** (4 edges + 4 corners) with min size enforcement, west/north edges clamped — [window.tsx](docker-workspaces/apps/web/src/components/window.tsx)
- Per-app icon styles (mono base + faint per-app tint) that adapt to light/dark mode — [app-icon.tsx](docker-workspaces/apps/web/src/components/app-icon.tsx)
- WebSocket client with auto-reconnect, StrictMode-safe teardown, request/reply correlation — [daemon.tsx](docker-workspaces/apps/web/src/state/daemon.tsx)

### Frontend — apps

| App            | What it does                                                                                                                                                                                                                                              |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **welcome**    | First screen on login, guided intro for the demo                                                                                                                                                                                                          |
| **terminal**   | Custom xterm-style terminal that talks to the websocket; supports cancellable commands (`Ctrl+C`)                                                                                                                                                         |
| **files**      | File manager with grid/list view, recent + pinned tabs, breadcrumb. Single-click selects, **double-click opens in the code app** (no in-app editor anymore)                                                                                               |
| **code**       | **Mini VS Code**: menu bar, activity bar, lazy-loaded explorer tree, multi-tab editor with gutter + syntax-highlighted overlay (textarea-on-pre trick), `Ctrl+S` to save, VS Code-blue status bar with Ln/Col + language + daemon connection              |
| **containers** | Docker Desktop look-alike: full sidebar (Gordon → Extensions, with BETA badges), header with engine status + session id + **inline aggregate CPU% / Memory usage stats**. Per-container detail with **Logs / Exec / Files / Stats** tabs (4 SVG charts polling every 2s) |
| **browser**    | In-app browser with Wikipedia search + reader mode for arbitrary URLs + smart routing of `localhost:<guestPort>` to the per-session host port                                                                                                             |
| **settings**   | Appearance + about                                                                                                                                                                                                                                        |

### Cross-app intent

The code app's open-tabs state lives in `WindowsContext` rather than inside
the code app, so:

- Tabs survive the code window being closed and re-opened
- The files app can push files into it via `openFileInCode(path)` without
  holding a reference to the code app component

### Shared utilities

- [lib/syntax.ts](docker-workspaces/apps/web/src/lib/syntax.ts) — `tokenize` + `languageFromName`, used by both the files app (for type icons) and the code app (for the editor)

## What's left to do

### Demo readiness (do these before the session)

- [ ] **End-to-end rehearsal** on a fresh laptop: `bun install` → `bun run dev` → open browser → walk through script.md beat-by-beat
- [ ] **Pre-pull** every image the demo needs into the local Docker daemon so first runs are instant (no awkward 30s pulls live on stage)
- [ ] **Reconnect test**: kill + reopen the tab, confirm the session and port reservations survive the 90s grace period
- [ ] **Resize stress test**: drag every window from every edge/corner, confirm no jitter or "escape past min size"
- [ ] **Stopped-container audit**: open the containers app on a stopped container, confirm stats / logs / files tabs degrade gracefully (no crash)
- [ ] **Projector audit**: every app on 1366×768 — nothing should overflow or get clipped

### Script alignment

- [ ] Walk through [plan.md](plan.md) + [script.md](script.md) and confirm **every "show this" beat has a working app screen** ready
- [ ] Pre-script the **exact commands** you'll type live (cheat sheet next to your screen — no live thinking)
- [ ] Decide which app the audience will be looking at during which 5-minute slice of the talk

### Polish (nice-to-have, not blocking)

- [ ] Files app: drag-and-drop file upload (workspace is currently fixed at start)
- [ ] Code app: real cursor-position tracking in the status bar (today's `Ln/Col` is best-effort, not the actual caret)
- [ ] Code app: the **Search** activity-bar panel is a stub — wire it up to grep the workspace
- [ ] Containers app: the **"Show charts"** link in the header is decorative — make it expand a sparkline strip
- [ ] Terminal: command history with up/down arrows
- [ ] Welcome app: a guided **Day 1 → Day 2 → …** walkthrough driven by the existing playthrough state

### Explicitly out of scope (don't build these)

- Multi-host docker / docker swarm
- A real shell sandbox — we don't need one because we never invoke a shell
- Persistent user accounts — sessions are ephemeral on purpose, that's the
  whole demo
- Real git integration in the code app — files are saved straight to disk

## Quick start

```bash
cd docker-workspaces
bun install
bun run dev      # spins up server (:4000) + web (:5173) via turbo
```

Open `http://localhost:5173`, type any username, and you're in the desktop.
The Docker daemon on the host machine is what actually runs the containers.
