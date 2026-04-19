# solutions

Working Dockerfiles for the taskboard project.

Fast path:

```bash
./solution.sh
docker compose up --build
```

Manual copy still works too:

```bash
cp solutions/backend.Dockerfile backend/Dockerfile
cp solutions/frontend.Dockerfile frontend/Dockerfile
docker compose up --build
```
