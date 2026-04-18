import express from "express"
import cors from "cors"
import mongoose from "mongoose"
import { createClient } from "redis"
import { Task } from "./models/task.js"

const app = express()
app.use(cors())
app.use(express.json())

const MONGO_URL = process.env.MONGO_URL || "mongodb://localhost:27017/taskboard"
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379"
const PORT = Number(process.env.PORT) || 3000

// Redis client
const redis = createClient({ url: REDIS_URL })
redis.on("error", (err) => console.error("Redis error:", err))

async function start() {
  await mongoose.connect(MONGO_URL)
  console.log("Connected to MongoDB")

  await redis.connect()
  console.log("Connected to Redis")

  // Health check
  app.get("/health", async (_req, res) => {
    const mongoOk = mongoose.connection.readyState === 1
    const redisOk = redis.isReady
    res.json({
      status: mongoOk && redisOk ? "healthy" : "unhealthy",
      mongo: mongoOk ? "connected" : "disconnected",
      redis: redisOk ? "connected" : "disconnected",
    })
  })

  // List tasks (cached in Redis for 30s)
  app.get("/api/tasks", async (_req, res) => {
    const cached = await redis.get("tasks:all")
    if (cached) {
      return res.json(JSON.parse(cached))
    }

    const tasks = await Task.find().sort({ createdAt: -1 })
    await redis.setEx("tasks:all", 30, JSON.stringify(tasks))
    res.json(tasks)
  })

  // Get single task
  app.get("/api/tasks/:id", async (req, res) => {
    const task = await Task.findById(req.params.id)
    if (!task) return res.status(404).json({ error: "Task not found" })
    res.json(task)
  })

  // Create task
  app.post("/api/tasks", async (req, res) => {
    const task = await Task.create({
      title: req.body.title,
      description: req.body.description,
      status: req.body.status || "todo",
      priority: req.body.priority || "medium",
    })
    await redis.del("tasks:all")
    res.status(201).json(task)
  })

  // Update task
  app.patch("/api/tasks/:id", async (req, res) => {
    const task = await Task.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    })
    if (!task) return res.status(404).json({ error: "Task not found" })
    await redis.del("tasks:all")
    res.json(task)
  })

  // Delete task
  app.delete("/api/tasks/:id", async (req, res) => {
    const task = await Task.findByIdAndDelete(req.params.id)
    if (!task) return res.status(404).json({ error: "Task not found" })
    await redis.del("tasks:all")
    res.json({ deleted: true })
  })

  // Stats endpoint
  app.get("/api/stats", async (_req, res) => {
    const [total, todo, inProgress, done] = await Promise.all([
      Task.countDocuments(),
      Task.countDocuments({ status: "todo" }),
      Task.countDocuments({ status: "in_progress" }),
      Task.countDocuments({ status: "done" }),
    ])
    res.json({ total, todo, inProgress, done })
  })

  app.listen(PORT, () => {
    console.log(`Backend listening on port ${PORT}`)
  })
}

start().catch((err) => {
  console.error("Failed to start:", err)
  process.exit(1)
})
