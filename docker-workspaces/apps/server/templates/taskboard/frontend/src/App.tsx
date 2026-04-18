import { useEffect, useState } from "react"

interface Task {
  _id: string
  title: string
  description: string
  status: "todo" | "in_progress" | "done"
  priority: "low" | "medium" | "high"
}

interface Stats {
  total: number
  todo: number
  inProgress: number
  done: number
}

const API = import.meta.env.VITE_API_URL || ""

export function App() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [newTitle, setNewTitle] = useState("")

  const fetchData = async () => {
    try {
      const [tasksRes, statsRes] = await Promise.all([
        fetch(`${API}/api/tasks`),
        fetch(`${API}/api/stats`),
      ])
      if (!tasksRes.ok || !statsRes.ok) throw new Error("API error")
      setTasks(await tasksRes.json())
      setStats(await statsRes.json())
      setError("")
    } catch {
      setError("Failed to connect to API")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const addTask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTitle.trim()) return
    await fetch(`${API}/api/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTitle.trim() }),
    })
    setNewTitle("")
    fetchData()
  }

  const statusOrder: Task["status"][] = ["todo", "in_progress", "done"]

  const moveTask = async (taskId: string, direction: "left" | "right") => {
    const task = tasks.find((t) => t._id === taskId)
    if (!task) return
    const idx = statusOrder.indexOf(task.status)
    const newIdx = direction === "right" ? idx + 1 : idx - 1
    if (newIdx < 0 || newIdx >= statusOrder.length) return
    await fetch(`${API}/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: statusOrder[newIdx] }),
    })
    fetchData()
  }

  const deleteTask = async (taskId: string) => {
    await fetch(`${API}/api/tasks/${taskId}`, { method: "DELETE" })
    fetchData()
  }

  const columns = [
    { key: "todo" as const, label: "To Do" },
    { key: "in_progress" as const, label: "In Progress" },
    { key: "done" as const, label: "Done" },
  ]

  if (loading) return <div className="loading">Loading...</div>
  if (error) return <div className="error">{error}</div>

  return (
    <div className="app">
      <header>
        <h1>Task Board</h1>
        <p>A simple task management app</p>
      </header>

      {stats && (
        <div className="stats">
          <div className="stat">
            <div className="stat-label">Total</div>
            <div className="stat-value">{stats.total}</div>
          </div>
          <div className="stat">
            <div className="stat-label">To Do</div>
            <div className="stat-value">{stats.todo}</div>
          </div>
          <div className="stat">
            <div className="stat-label">In Progress</div>
            <div className="stat-value">{stats.inProgress}</div>
          </div>
          <div className="stat">
            <div className="stat-label">Done</div>
            <div className="stat-value">{stats.done}</div>
          </div>
        </div>
      )}

      <form className="add-form" onSubmit={addTask}>
        <input
          placeholder="Add a new task..."
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
        />
        <button type="submit">Add</button>
      </form>

      <div className="board">
        {columns.map((col) => {
          const colTasks = tasks.filter((t) => t.status === col.key)
          return (
            <div className="column" key={col.key}>
              <div className="column-header">
                <span className="column-title">{col.label}</span>
                <span className="column-count">{colTasks.length}</span>
              </div>
              <div className="task-list">
                {colTasks.map((task) => (
                  <div className="task-card" key={task._id}>
                    <div className="task-title">{task.title}</div>
                    {task.description && (
                      <div className="task-desc">{task.description}</div>
                    )}
                    <div className="task-meta">
                      <span
                        className={`priority-badge priority-${task.priority}`}
                      >
                        {task.priority}
                      </span>
                      <div className="task-actions">
                        {col.key !== "todo" && (
                          <button
                            className="move-btn"
                            onClick={() => moveTask(task._id, "left")}
                            title="Move left"
                          >
                            &larr;
                          </button>
                        )}
                        {col.key !== "done" && (
                          <button
                            className="move-btn"
                            onClick={() => moveTask(task._id, "right")}
                            title="Move right"
                          >
                            &rarr;
                          </button>
                        )}
                        <button
                          className="delete-btn"
                          onClick={() => deleteTask(task._id)}
                          title="Delete"
                        >
                          &times;
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
