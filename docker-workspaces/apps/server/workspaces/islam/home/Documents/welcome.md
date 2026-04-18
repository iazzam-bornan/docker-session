# welcome to dockerlab

this is your private home directory.

## projects

you have two projects under ~/projects/:

### greeter-api (start here)
a tiny express API — one endpoint, one file.
open the Dockerfile and fill in the `???` placeholders to
learn the basics: FROM, WORKDIR, COPY, RUN, EXPOSE, CMD.

### taskboard (full-stack challenge)
a React + Express + MongoDB + Redis task board.
write TWO Dockerfiles: one for the backend (TypeScript compile step),
one for the frontend (multi-stage build: Node → nginx).
then run everything with `docker compose up --build`.

## solutions

each project has a `solutions/` folder with the working Dockerfiles.
try to write them yourself first! if you're stuck, peek at the answer.

## getting started

```
cd projects/greeter-api
code .                    # open in the editor
cat TUTORIAL.md           # follow the step-by-step guide
```

each project has:
- `README.md` — quick overview + reference
- `TUTORIAL.md` — full step-by-step walkthrough
- `Dockerfile` — your task (fill in the ???)
- `solutions/` — working answers (try yourself first!)

everything you create here lives only inside your session.
when you disconnect, it gets cleaned up after a 90-second grace period.
