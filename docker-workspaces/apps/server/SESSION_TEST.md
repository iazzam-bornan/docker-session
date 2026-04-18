# dockerlab session test plan

A run-through script for verifying the demo works end-to-end and that
multiple users can drive their own workspaces concurrently without
stepping on each other.

Run this **before every session**.

## Prerequisites

- Docker Desktop running, daemon reachable (`docker version`)
- Both processes started:
  ```
  bun run --filter server dev
  bun run --filter web dev
  ```
- The web app is reachable from any device on the venue wifi at
  `http://<your-laptop-ip>:5173`
- The backend is reachable at `http://<your-laptop-ip>:4000` and the
  frontend `lib/backend.ts` resolves the websocket against the same host

## Smoke test 1 — single user demo arc

Open one browser tab. Sign in as `alice`.

1. **Welcome shows step 1 highlighted.** Open the files app — step 1
   ("open the project") flips to ✓ and step 2 ("build the image") becomes
   the new current step.
2. **Edit the Dockerfile.** Click `Dockerfile` → `edit` → change something
   harmless (a comment, a `LABEL` line) → `save`. Header should briefly
   show the file is unsaved, then settle.
3. **Open the terminal.** Type `docker build -t greeter .` → real build
   output streams in. First build pulls `node:20-alpine` (~30s). When it
   finishes, the welcome step ticks off.
4. **`docker images`** → see your `alice-greeter:latest` listed.
5. **`docker run -p 3000:3000 greeter`** → epilogue says
   `→ http://localhost:3000` (the host port is hidden by the daemon's
   port translator).
6. **`docker ps`** → see the running container.
7. **Open the containers app.** Real `alice-greeter` row. Click `stop`
   → row state flips to `exited`. Click `remove` → row disappears.
8. **Open the browser app.** Type `localhost:3000` (or click the bookmark)
   → if container is running, you see the JSON response. If not, ERR.
9. **Re-run the container,** reload the browser preview → see it again.
10. **`docker logs greeter`** → see "greeter-api listening on 3000".
11. **`docker logs -f greeter`** → output streams. Click the **cancel
    button** in the terminal status strip (or hit `Ctrl+C`) → output
    stops, prompt comes back.
12. **`docker compose up -d`** → starts the stack (skip if you didn't
    add a compose file). `docker compose ps` shows the service.
13. **`docker compose down`** → tears it down.
14. **`docker rm -f greeter`** → cleanup.
15. **Close the tab.** After 90 seconds, all of `alice`'s containers
    and images should be gone from the host. Verify with:
    ```
    docker ps -a --filter label=session=alice
    docker images --filter label=session=alice
    ```
    Both should be empty.

## Smoke test 2 — concurrent users (the multi-user check)

Open **two** browser tabs (incognito windows are easiest so localStorage
doesn't share). Sign in as `alice` and `bob`.

1. In `alice`'s tab: `docker build -t app .`
2. In `bob`'s tab: `docker build -t app .` *(at the same time if you can —
   they should both run, the second hits the layer cache for upstream
   layers and finishes fast)*
3. In `alice`'s tab: `docker images` → see ONLY `alice-app`. Not bob's.
4. In `bob`'s tab: `docker images` → see ONLY `bob-app`. Not alice's.
5. In `alice`'s tab: `docker run -p 3000:3000 app`
6. In `bob`'s tab: `docker run -p 3000:3000 app` *(at the same time)*
   - Both should succeed, even though they both asked for "port 3000".
   - The daemon's port allocator gives alice slot 30000–30009 and bob
     slot 30010–30019.
7. In `alice`'s tab: open the browser app → `localhost:3000` → see
   alice's container response.
8. In `bob`'s tab: open the browser app → `localhost:3000` → see
   bob's container response. **Two different containers, both
   reachable at "localhost:3000" from each user's perspective.**
9. From your laptop's terminal (outside the apps), verify isolation:
   ```
   docker ps --filter label=session=alice --format '{{.Names}} {{.Ports}}'
   docker ps --filter label=session=bob --format '{{.Names}} {{.Ports}}'
   ```
   Each should show one container with a different host port mapping.
10. Close `bob`'s tab. Wait 90 seconds. Confirm bob's container is gone
    but alice's is still running.
11. Close `alice`'s tab. Wait 90 seconds. Confirm alice's container is
    also gone.

## Smoke test 3 — disconnect grace period

1. Sign in as `flake`. Run `docker run -p 3000:3000 greeter`.
2. **Reload the page.** The websocket disconnects and reconnects within
   a few seconds. The cleanup sweep should be cancelled because the
   reconnect happens within the 90-second grace period.
3. Verify: `docker ps --filter label=session=flake` → still running.
4. **Close the tab entirely** (don't reload — close). Wait 90 seconds.
   The container should be gone.

## Multi-device load test (do this at the venue)

Once the venue wifi is set up:

1. Find your laptop's wifi IP: `ipconfig getifaddr en0` (mac) or
   `ipconfig` (windows). Example: `192.168.1.42`.
2. Make sure your laptop's firewall lets inbound TCP 4000 and 5173.
3. From your phone on the same wifi, open
   `http://192.168.1.42:5173`. Sign in. Verify you can run `docker
   images`. **If this fails, the venue wifi is blocking client-to-host
   traffic** — bring a travel router as backup.
4. Get 2–3 colleagues to do the same. Verify their sessions show up in
   `http://192.168.1.42:4000/_debug` as separate entries.
5. Have everyone build + run simultaneously. Watch your laptop's
   activity monitor. CPU should spike but not pin; RAM use should stay
   under ~2 GB additional for ~5 users.

## What to do if something breaks during the session

### "the page doesn't load on my friend's laptop"
- Wifi is isolating clients. Switch to your phone's hotspot or the
  travel router.

### "i clicked stop and the browser still shows the old container"
- The browser iframe doesn't auto-refresh. Click the reload button in
  the in-app browser's toolbar (or hit Cmd+R inside the iframe).

### "docker says port already in use"
- One of the audience port slices collided with something else on your
  host. Stop whatever's using that port range (check `netstat -ano`).

### "my laptop is melting"
- A container has runaway. From your real terminal:
  ```
  docker ps --format '{{.Names}}' | xargs -L1 docker stats --no-stream
  ```
  Then `docker rm -f <name>` the offender.

### "the session demo crashed mid-presentation"
- Hit `/_debug` to see active sessions
- `docker ps -a --filter label=session=<id>` and `docker rm -f` to wipe
- The user can sign back in and the workspace is preserved

## What `_debug` returns

```
GET http://localhost:4000/_debug
{
  "sessions": [
    {
      "id": "alice",
      "username": "alice",
      "projectDir": "/.../workspaces/alice/greeter-api",
      "connected": true,
      "createdAt": "2026-04-08T19:00:00.000Z"
    }
  ]
}
```

Use this to confirm who's currently signed in and which sessions are
warm vs disconnected.
