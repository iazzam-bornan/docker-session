import express from "express"

const app = express()
const port = process.env.PORT ?? 3000

app.get("/", (_req, res) => {
  res.json({ ok: true, service: "greeter-api" })
})

app.get("/hello/:name", (req, res) => {
  const { name } = req.params
  res.json({ message: `hello, ${name}!` })
})

app.listen(port, "0.0.0.0", () => {
  console.log(`greeter-api listening on ${port}`)
})
