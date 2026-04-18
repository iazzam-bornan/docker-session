import { cn } from "@workspace/ui/lib/utils"

import { usePlaythrough, type PlaythroughStep } from "@/state/playthrough"
import { useSession } from "@/state/session"
import { useWindows } from "@/state/windows"

export function WelcomeApp() {
  const { user } = useSession()
  const { open } = useWindows()
  const { steps, cursor, completed, manualComplete, reset } = usePlaythrough()

  const totalDone = completed.size
  const totalSteps = steps.length

  const phase1Steps = steps.filter((s) => s.phase === 1)
  const phase2Steps = steps.filter((s) => s.phase === 2)
  const phase1Done = phase1Steps.filter((s) => completed.has(s.id)).length
  const phase2Done = phase2Steps.filter((s) => completed.has(s.id)).length

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* header */}
      <div className="border-b border-border px-5 py-4">
        <div className="text-sm text-foreground/85">
          hello,{" "}
          <span className="text-foreground">{user?.name ?? "friend"}</span>
        </div>
        <p className="mt-1 text-xs text-foreground/50">
          learn Docker by actually writing Dockerfiles and running containers.
          follow the steps below — from a simple API to a full-stack app.
        </p>
        <div className="mt-3 flex items-center gap-2 font-mono text-[10px] text-foreground/55">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-sunken">
            <div
              className="h-full bg-primary transition-all duration-500"
              style={{
                width: `${Math.round((totalDone / totalSteps) * 100)}%`,
              }}
            />
          </div>
          <span className="tabular-nums">
            {totalDone}/{totalSteps}
          </span>
        </div>
      </div>

      {/* steps */}
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {/* Phase 1 */}
        <PhaseHeader
          label="Phase 1: Your First Dockerfile"
          subtitle="greeter-api — a simple Express app"
          done={phase1Done}
          total={phase1Steps.length}
        />
        <ol className="mb-6 space-y-2">
          {phase1Steps.map((step) => (
            <StepRow
              key={step.id}
              step={step}
              index={steps.indexOf(step)}
              cursor={cursor}
              isDone={completed.has(step.id)}
              onManualCheck={
                step.manualCheck ? () => manualComplete(step.id) : undefined
              }
            />
          ))}
        </ol>

        {/* Phase 2 */}
        <PhaseHeader
          label="Phase 2: Full-Stack with Compose"
          subtitle="taskboard — React + Express + MongoDB + Redis"
          done={phase2Done}
          total={phase2Steps.length}
        />
        <ol className="space-y-2">
          {phase2Steps.map((step) => (
            <StepRow
              key={step.id}
              step={step}
              index={steps.indexOf(step)}
              cursor={cursor}
              isDone={completed.has(step.id)}
              onManualCheck={
                step.manualCheck ? () => manualComplete(step.id) : undefined
              }
            />
          ))}
        </ol>
      </div>

      {/* footer */}
      <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-3">
        <button
          onClick={reset}
          className="rounded border border-border px-2.5 py-1 text-xs text-foreground/55 hover:border-foreground/25 hover:text-foreground/85"
        >
          reset progress
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => open("files")}
            className="rounded border border-border px-2.5 py-1 text-xs text-foreground/70 hover:border-foreground/25 hover:text-foreground"
          >
            files
          </button>
          <button
            onClick={() => open("code")}
            className="rounded border border-border px-2.5 py-1 text-xs text-foreground/70 hover:border-foreground/25 hover:text-foreground"
          >
            code
          </button>
          <button
            onClick={() => open("terminal")}
            className="rounded border border-border bg-surface-elevated px-2.5 py-1 text-xs text-foreground hover:bg-surface-elevated"
          >
            terminal
          </button>
        </div>
      </div>
    </div>
  )
}

function PhaseHeader({
  label,
  subtitle,
  done,
  total,
}: {
  label: string
  subtitle: string
  done: number
  total: number
}) {
  const allDone = done === total
  return (
    <div className="mb-3 flex items-center gap-3">
      <div className="flex-1">
        <div
          className={cn(
            "text-xs font-semibold tracking-wide uppercase",
            allDone ? "text-primary" : "text-foreground/70"
          )}
        >
          {allDone && "✓ "}
          {label}
        </div>
        <div className="text-[10px] text-foreground/40">{subtitle}</div>
      </div>
      <div className="font-mono text-[10px] text-foreground/45 tabular-nums">
        {done}/{total}
      </div>
    </div>
  )
}

function StepRow({
  step,
  index,
  cursor,
  isDone,
  onManualCheck,
}: {
  step: PlaythroughStep
  index: number
  cursor: number
  isDone: boolean
  onManualCheck?: () => void
}) {
  const isCurrent = !isDone && index === cursor
  const isFuture = !isDone && index > cursor
  const num = (index + 1).toString().padStart(2, "0")

  return (
    <li
      className={cn(
        "flex gap-3 rounded-lg border p-3 transition",
        isCurrent && "border-primary/50 bg-primary/5",
        isDone && "border-border bg-transparent opacity-70",
        isFuture && "border-border bg-transparent opacity-50"
      )}
    >
      {/* number / check circle */}
      <button
        type="button"
        onClick={onManualCheck}
        disabled={isDone || !onManualCheck}
        className={cn(
          "grid size-5 shrink-0 place-items-center rounded-full border font-mono text-[10px] tabular-nums transition",
          isDone
            ? "border-primary/60 bg-primary text-primary-foreground"
            : isCurrent && onManualCheck
              ? "cursor-pointer border-primary text-primary hover:bg-primary/15"
              : isCurrent
                ? "border-primary text-primary"
                : "border-border text-foreground/40"
        )}
        title={
          onManualCheck && !isDone
            ? "click to mark done"
            : undefined
        }
      >
        {isDone ? "✓" : num}
      </button>

      <div className="min-w-0 flex-1">
        <div
          className={cn(
            "text-sm",
            isDone
              ? "text-foreground/65 line-through decoration-foreground/30"
              : "text-foreground/90"
          )}
        >
          {step.title}
        </div>
        <p className="mt-0.5 text-xs text-foreground/50">{step.body}</p>
        {step.command && (
          <div className="mt-1.5 rounded border border-border bg-surface-sunken px-2 py-1 font-mono text-[11px] text-foreground/80">
            <span className="mr-1.5 text-foreground/35">$</span>
            {step.command}
          </div>
        )}
        {onManualCheck && !isDone && isCurrent && (
          <button
            type="button"
            onClick={onManualCheck}
            className="mt-2 rounded border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] text-primary hover:bg-primary/20"
          >
            mark as done
          </button>
        )}
      </div>
    </li>
  )
}
