/* eslint-disable react-refresh/only-export-components */
import * as React from "react"

// ─────────────────────────────────────────────────────────────────────────
// guided playthrough state
//
// the welcome app shows a numbered checklist that walks attendees through
// the full demo arc — from first Dockerfile to multi-service compose.
//
// two phases:
//   phase 1: greeter-api (basic Dockerfile concepts)
//   phase 2: taskboard   (TypeScript, multi-stage, compose)
//
// each step has a `match` function tested against every finished terminal
// command. some steps are completed by opening an app (files, code) or
// by the user manually checking them off.
// ─────────────────────────────────────────────────────────────────────────

export type PlaythroughStep = {
  id: string
  title: string
  body: string
  command: string | null
  /** which phase this step belongs to (for section headers in the UI) */
  phase: 1 | 2
  /** does this finished command complete the step? */
  match?: (command: string, exitCode: number) => boolean
  /** can the user manually check this off (for non-command steps) */
  manualCheck?: boolean
}

export const STEPS: PlaythroughStep[] = [
  // ─── Phase 1: greeter-api ─────────────────────────────────────────
  {
    id: "open-project",
    title: "open the greeter-api project",
    body: "navigate to ~/projects/greeter-api in the terminal or files app. open it in the code editor with `code .`",
    command: "cd projects/greeter-api && code .",
    phase: 1,
    // auto-completed when files app is opened
  },
  {
    id: "read-dockerfile",
    title: "read the Dockerfile",
    body: "open Dockerfile in the code editor. it has step-by-step hints with ??? placeholders. read through all 6 steps before writing anything.",
    command: null,
    phase: 1,
    manualCheck: true,
  },
  {
    id: "write-dockerfile",
    title: "fill in the Dockerfile",
    body: "uncomment each step and replace ??? with the correct values. hints tell you what to write. if stuck, check solutions/Dockerfile.",
    command: null,
    phase: 1,
    manualCheck: true,
  },
  {
    id: "build",
    title: "build the image",
    body: "build your Dockerfile into a Docker image. tag it 'greeter'.",
    command: "docker build -t greeter .",
    phase: 1,
    match: (cmd, exit) =>
      /^docker\s+build\s+-t\s+\w/.test(cmd) && exit === 0,
  },
  {
    id: "run",
    title: "run the container",
    body: "start a container from your image. map port 3000 so you can reach it from the browser.",
    command: "docker run -p 3000:3000 greeter",
    phase: 1,
    match: (cmd, exit) =>
      /^docker\s+run.*-p\s+\d+:\d+/.test(cmd) && exit === 0,
  },
  {
    id: "test",
    title: "test it in the browser",
    body: "open the browser app and visit http://localhost:3000/hello/yourname. you should see a JSON greeting.",
    command: null,
    phase: 1,
    manualCheck: true,
  },
  {
    id: "ps",
    title: "see it running",
    body: "check with docker ps or open the containers app. your container should be listed as running.",
    command: "docker ps",
    phase: 1,
    match: (cmd, exit) =>
      /^docker\s+ps(\s+-a)?\s*$/.test(cmd) && exit === 0,
  },
  {
    id: "cleanup",
    title: "stop and remove",
    body: "stop the container. you've completed the basic Docker loop: write → build → run → test → cleanup.",
    command: "docker rm -f greeter",
    phase: 1,
    match: (cmd, exit) =>
      /^docker\s+(stop|rm)/.test(cmd) && exit === 0,
  },

  // ─── Phase 2: taskboard (full-stack) ──────────────────────────────
  {
    id: "open-taskboard",
    title: "open the taskboard project",
    body: "navigate to ~/projects/taskboard. this is a full-stack app: React frontend + Express API + MongoDB + Redis.",
    command: "cd ~/projects/taskboard && code .",
    phase: 2,
    manualCheck: true,
  },
  {
    id: "explore-structure",
    title: "explore the project structure",
    body: "look at backend/src/index.ts (Express API), frontend/src/App.tsx (React), docker-compose.yml (orchestration). understand the architecture before writing Dockerfiles.",
    command: "ls",
    phase: 2,
    manualCheck: true,
  },
  {
    id: "write-backend-dockerfile",
    title: "write backend/Dockerfile",
    body: "open backend/Dockerfile. similar to greeter-api but with a TypeScript compile step (npx tsc). fill in the ??? placeholders.",
    command: null,
    phase: 2,
    manualCheck: true,
  },
  {
    id: "write-frontend-dockerfile",
    title: "write frontend/Dockerfile (multi-stage!)",
    body: "open frontend/Dockerfile. this one has TWO stages: build with Node → serve with nginx. the final image is tiny (~25MB).",
    command: null,
    phase: 2,
    manualCheck: true,
  },
  {
    id: "compose-up",
    title: "run with docker compose",
    body: "docker-compose.yml is already written for you. it wires up mongo, redis, backend, and frontend. one command to start everything.",
    command: "docker compose up --build",
    phase: 2,
    match: (cmd, exit) =>
      /^docker\s+compose\s+up/.test(cmd) && exit === 0,
  },
  {
    id: "test-taskboard",
    title: "test the task board",
    body: "open http://localhost:8080 in the browser. you should see a kanban board with sample tasks. try adding a task!",
    command: null,
    phase: 2,
    manualCheck: true,
  },
  {
    id: "compose-ps",
    title: "inspect the running stack",
    body: "check all 4 services are running. look at the containers app or use docker compose ps.",
    command: "docker compose ps",
    phase: 2,
    match: (cmd, exit) =>
      /^docker\s+compose\s+ps/.test(cmd) && exit === 0,
  },
  {
    id: "compose-down",
    title: "tear it all down",
    body: "stop and remove everything. use -v to also wipe the database volume. congratulations — you've containerized a full-stack app!",
    command: "docker compose down -v",
    phase: 2,
    match: (cmd, exit) =>
      /^docker\s+compose\s+down/.test(cmd) && exit === 0,
  },
]

type PlaythroughState = {
  cursor: number
  completed: Set<string>
  buildCount: number
  filesOpened: boolean
}

type PlaythroughContextValue = {
  steps: PlaythroughStep[]
  cursor: number
  completed: Set<string>
  recordCommand: (command: string, exitCode: number) => void
  markFilesOpened: () => void
  /** manually check off a step (for non-command steps) */
  manualComplete: (stepId: string) => void
  reset: () => void
}

const PlaythroughContext = React.createContext<
  PlaythroughContextValue | undefined
>(undefined)

const STORAGE_KEY = "dockerlab.playthrough.v2"

function loadState(): PlaythroughState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return { cursor: 0, completed: new Set(), buildCount: 0, filesOpened: false }
    }
    const parsed = JSON.parse(raw) as {
      cursor?: number
      completed?: string[]
      buildCount?: number
      filesOpened?: boolean
    }
    return {
      cursor: parsed.cursor ?? 0,
      completed: new Set(parsed.completed ?? []),
      buildCount: parsed.buildCount ?? 0,
      filesOpened: parsed.filesOpened ?? false,
    }
  } catch {
    return { cursor: 0, completed: new Set(), buildCount: 0, filesOpened: false }
  }
}

function persistState(state: PlaythroughState): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        cursor: state.cursor,
        completed: Array.from(state.completed),
        buildCount: state.buildCount,
        filesOpened: state.filesOpened,
      })
    )
  } catch {
    /* ignore */
  }
}

export function PlaythroughProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [state, setState] = React.useState<PlaythroughState>(() => loadState())

  React.useEffect(() => {
    persistState(state)
  }, [state])

  const advance = React.useCallback(
    (predicate: (step: PlaythroughStep, index: number) => boolean) => {
      setState((prev) => {
        let { cursor } = prev
        const completed = new Set(prev.completed)
        for (let i = cursor; i < STEPS.length; i++) {
          const step = STEPS[i]
          if (completed.has(step.id)) continue
          if (predicate(step, i)) {
            completed.add(step.id)
            cursor = i + 1
            continue
          }
          cursor = i
          break
        }
        return { ...prev, cursor, completed }
      })
    },
    []
  )

  const recordCommand = React.useCallback(
    (command: string, exitCode: number) => {
      const trimmed = command.trim()
      setState((prev) => {
        if (/^docker\s+build/.test(trimmed) && exitCode === 0) {
          return { ...prev, buildCount: prev.buildCount + 1 }
        }
        return prev
      })
      advance((step) => {
        return step.match ? step.match(trimmed, exitCode) : false
      })
    },
    [advance]
  )

  const markFilesOpened = React.useCallback(() => {
    setState((prev) => {
      if (prev.filesOpened) return prev
      const completed = new Set(prev.completed)
      completed.add("open-project")
      const cursor = prev.cursor === 0 ? 1 : prev.cursor
      return { ...prev, filesOpened: true, completed, cursor }
    })
  }, [])

  const manualComplete = React.useCallback(
    (stepId: string) => {
      advance((step) => step.id === stepId)
    },
    [advance]
  )

  const reset = React.useCallback(() => {
    setState({ cursor: 0, completed: new Set(), buildCount: 0, filesOpened: false })
  }, [])

  const value = React.useMemo<PlaythroughContextValue>(
    () => ({
      steps: STEPS,
      cursor: state.cursor,
      completed: state.completed,
      recordCommand,
      markFilesOpened,
      manualComplete,
      reset,
    }),
    [state.cursor, state.completed, recordCommand, markFilesOpened, manualComplete, reset]
  )

  return (
    <PlaythroughContext.Provider value={value}>
      {children}
    </PlaythroughContext.Provider>
  )
}

export function usePlaythrough(): PlaythroughContextValue {
  const ctx = React.useContext(PlaythroughContext)
  if (!ctx)
    throw new Error("usePlaythrough must be used within PlaythroughProvider")
  return ctx
}
