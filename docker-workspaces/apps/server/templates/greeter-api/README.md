# greeter-api

A tiny Express service that greets you by name.

## what's here

```
greeter-api/
  server.js         the app (GET / and GET /hello/:name)
  package.json      one dependency: express
  Dockerfile        YOUR TASK — fill in the blanks
  solutions/
    Dockerfile      the working answer (don't peek yet!)
```

## exercise: write a Dockerfile

Open the `Dockerfile` in this folder. It has step-by-step hints with
`???` placeholders for you to fill in. Each step explains what the
instruction does and why.

### quick reference

| Instruction | What it does                          |
|-------------|---------------------------------------|
| `FROM`      | Sets the base image                   |
| `WORKDIR`   | Sets the working directory            |
| `COPY`      | Copies files from host into container |
| `RUN`       | Runs a command during build           |
| `EXPOSE`    | Documents which port the app uses     |
| `CMD`       | Sets the default start command        |

### build & run

Once your Dockerfile is filled in:

```bash
docker build -t greeter .
docker run -p 3000:3000 greeter
```

Then open http://localhost:3000/hello/yourname in the browser.

### stuck?

Check `solutions/Dockerfile` for the working answer.
