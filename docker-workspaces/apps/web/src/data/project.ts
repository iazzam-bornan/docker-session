export type FileNode = {
  type: "file"
  name: string
  language: string
  content: string
}

export type DirNode = {
  type: "dir"
  name: string
  children: Node[]
}

export type Node = FileNode | DirNode

export const project: DirNode = {
  type: "dir",
  name: "greeter-api",
  children: [
    {
      type: "file",
      name: "README.md",
      language: "markdown",
      content: `# greeter-api

A tiny Express service that greets you by name.

## Run locally
\`\`\`
npm install
npm start
\`\`\`

The server listens on port 3000. Try:
\`\`\`
curl http://localhost:3000/hello/ada
\`\`\`

> But… does it run the same on every laptop in this room? Probably not.
> Let's fix that with Docker.
`,
    },
    {
      type: "file",
      name: "package.json",
      language: "json",
      content: `{
  "name": "greeter-api",
  "version": "1.0.0",
  "main": "server.js",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "express": "^4.19.2"
  },
  "engines": {
    "node": ">=20"
  }
}
`,
    },
    {
      type: "file",
      name: "server.js",
      language: "javascript",
      content: `import express from "express"

const app = express()
const port = process.env.PORT ?? 3000

app.get("/", (_req, res) => {
  res.json({ ok: true, service: "greeter-api" })
})

app.get("/hello/:name", (req, res) => {
  const { name } = req.params
  res.json({ message: \`hello, \${name}!\` })
})

app.listen(port, "0.0.0.0", () => {
  console.log(\`greeter-api listening on \${port}\`)
})
`,
    },
    {
      type: "file",
      name: "Dockerfile",
      language: "dockerfile",
      content: `# Multi-stage build keeps the final image small.
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev

FROM node:20-alpine AS runtime
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "server.js"]
`,
    },
    {
      type: "file",
      name: "docker-compose.yml",
      language: "yaml",
      content: `services:
  api:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
    restart: unless-stopped
`,
    },
    {
      type: "file",
      name: ".dockerignore",
      language: "plaintext",
      content: `node_modules
npm-debug.log
.env
.git
`,
    },
  ],
}
