// Standalone seed script that runs with mongosh inside the mongo container
// Usage: mongosh mongodb://localhost:27017/taskboard seed.js

db = db.getSiblingDB("taskboard")

db.tasks.drop()

db.tasks.insertMany([
  {
    title: "Set up project structure",
    description: "Initialize the monorepo with frontend and backend workspaces",
    status: "done",
    priority: "high",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    title: "Design database schema",
    description: "Define MongoDB models for tasks, users, and projects",
    status: "done",
    priority: "high",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    title: "Implement authentication",
    description: "Add JWT-based auth with login and register endpoints",
    status: "in_progress",
    priority: "high",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    title: "Build task CRUD API",
    description: "REST endpoints for creating, reading, updating, and deleting tasks",
    status: "done",
    priority: "medium",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    title: "Add Redis caching",
    description: "Cache frequently accessed data like task lists in Redis",
    status: "in_progress",
    priority: "medium",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    title: "Create task board UI",
    description: "Drag-and-drop kanban board with columns for each status",
    status: "in_progress",
    priority: "high",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    title: "Add search and filters",
    description: "Allow filtering tasks by status, priority, and text search",
    status: "todo",
    priority: "medium",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    title: "Write API tests",
    description: "Integration tests for all backend endpoints",
    status: "todo",
    priority: "medium",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    title: "Add dark mode",
    description: "Theme toggle with system preference detection",
    status: "todo",
    priority: "low",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    title: "Deploy to production",
    description: "Set up CI/CD pipeline and deploy to cloud",
    status: "todo",
    priority: "low",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
])

print("Seeded " + db.tasks.countDocuments() + " tasks")
