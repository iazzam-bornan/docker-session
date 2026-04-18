// End-to-end smoke test for the dockerlab backend.
//
//   bun run apps/server/src/smoke-test.ts
//
// runs the full demo arc against a live server: hello → images → build →
// images → run → ps → stop → ps. prints every reply. exits 0 on success.
//
// requires: server running on :4000 AND a working docker daemon. the build
// step actually pulls node:20-alpine the first time, so the first run takes
// 30-60 seconds. subsequent runs hit the layer cache and finish in seconds.

const ws = new WebSocket("ws://localhost:4000/ws")

let nextId = 1
const SCRIPT: string[] = [
  "docker images",
  "docker build -t greeter .",
  "docker images",
  "docker run -p 3000:3000 greeter",
  "docker ps",
  "docker stop greeter",
  "docker ps -a",
  "docker rm greeter",
]
let scriptIdx = 0

function runNext() {
  if (scriptIdx >= SCRIPT.length) {
    console.log("\n✓ smoke test complete")
    setTimeout(() => process.exit(0), 50)
    return
  }
  const command = SCRIPT[scriptIdx++]
  console.log(`\n→ ${command}`)
  ws.send(JSON.stringify({ kind: "run", msgId: nextId++, command }))
}

ws.addEventListener("open", () => {
  console.log("ws open")
  ws.send(
    JSON.stringify({ kind: "hello", username: "smoketest", msgId: nextId++ })
  )
})

ws.addEventListener("message", (e) => {
  const msg = JSON.parse(String(e.data))
  if (msg.kind === "hello") {
    console.log(`session: ${msg.sessionId}`)
    console.log(`workspace: ${msg.workspace}`)
    runNext()
    return
  }
  if (msg.kind === "stream") {
    process.stdout.write(msg.text)
    return
  }
  if (msg.kind === "done") {
    if (msg.exitCode !== 0) console.log(`(exit ${msg.exitCode})`)
    runNext()
    return
  }
  if (msg.kind === "reject") {
    console.error(`✗ rejected: ${msg.reason}`)
    if (msg.hint) console.error(`  hint: ${msg.hint}`)
    process.exit(1)
  }
  if (msg.kind === "error") {
    console.error(`✗ error: ${msg.message}`)
    process.exit(1)
  }
})

ws.addEventListener("error", () => {
  console.error("ws error — is the server running on :4000?")
  process.exit(1)
})
