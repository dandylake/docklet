# Docklet

A self-hosted Docker management UI. One `docker run` command, then manage containers, images, logs, and files from any browser. No accounts, no cloud.

## Table of Contents

- [Features](#features)
- [Requirements](#requirements)
- [Quick Start](#quick-start)
- [First-Run Setup](#first-run-setup)
- [HTTPS](#https)
- [Configuration](#configuration)
- [Docker Compose](#docker-compose)
- [Upgrading](#upgrading)
- [Testing](#testing)
- [Common Issues](docs/COMMON_ISSUES.md)
- [Testing Architecture](docs/TESTING.md)
- [Development](#development)

## Features

### Container Management
- Start, stop, restart, and remove containers
- Create containers from saved templates (persisted in the database)
- Real-time log streaming via SSE
- View container details, environment variables, and port mappings
- Auto-managed bind mounts under a single data volume

### Image Management
- List local images with size and tag info
- Pull images from Docker Hub or any registry
- Remove unused images

### Security & Auth
- Setup wizard on first run with no config files needed
- Role-based access control: `admin`, `mod`, `user`
- Passwords hashed with bcrypt, sessions via signed JWTs (httpOnly cookies)
- HTTPS by default with auto-generated self-signed cert; upload your own for a real domain

### Deployment
- Single `docker run` command, zero config files
- All settings stored in SQLite, managed entirely through the web UI
- Persistent data (DB, certs, volumes) in one directory for easy backups

## Requirements

- **Docker Engine 20.10+** running on the host (exposes `/var/run/docker.sock`)
- **Ports 80 and 443** available on the host
- **Linux host** (Docker Desktop on Mac/Windows may work but is not officially supported)
- A persistent directory for data storage

No other software required. The container bundles Node.js 22, nginx, and OpenSSL.

## Quick Start

```bash
docker run -d --name docklet \
  -p 80:80 -p 443:443 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v /docklet-data:/docklet-data \
  --restart always \
  ghcr.io/dandylake/docklet:latest
```

Note: If you use a data location other than `/docklet-data`, be sure to set the `HOST_DATA_DIR` environment variable to the absolute path of the new directory on the host system.

Then open `https://localhost` to complete the setup wizard. Accept the browser warning for the self-signed certificate.

## First-Run Setup

1. Navigate to `https://localhost` and you'll be redirected to the setup wizard
2. Create your admin account (username + password)
3. Click "Go to Dashboard" to start managing containers

## HTTPS

Docklet runs on HTTPS by default. A self-signed certificate is generated automatically at `/docklet-data/certs/` on first start. HTTP (port 80) redirects to HTTPS.

### Custom Domain Certificate

1. Go to **Settings > TLS Certificates**
2. Upload your certificate and private key
3. Restart the container. nginx picks up the new cert on next boot.

## Configuration

### Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `DOCKLET_DATA_DIR` | `/docklet-data` | Root data directory |
| `HOST_DATA_DIR` | *(same as `DOCKLET_DATA_DIR`)* | Host path for Docker bind mounts. Set when the data directory path on the Docker host differs from its path inside the Docklet container (e.g. Docker Desktop on Mac). |
| `DOCKER_SOCKET` | `/var/run/docker.sock` | Docker daemon socket |

All other configuration is managed through the web UI and stored in the settings table.

### Data Persistence

All data lives in a single volume:

```
/docklet-data/
  db/docklet.db          # Database (users, settings, templates)
  certs/                 # TLS certificates (auto-generated on first run)
  backups/               # Reserved for future automated backups
  volumes/<name>/        # Auto-managed container bind mounts
```

To back up your instance, copy the entire data directory.

## Docker Compose

```yaml
services:
  docklet:
    image: ghcr.io/dandylake/docklet:latest
    container_name: docklet
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - /docklet-data:/docklet-data
    restart: always
```

## Upgrading

```bash
docker pull ghcr.io/dandylake/docklet:latest
docker stop docklet && docker rm docklet
# Re-run the docker run command. Your data persists in the volume.
```

## Testing

Docklet has three layers of automated tests.

**Unit tests** (Vitest) cover service modules and pure logic in isolation. External dependencies are mocked at the module level.

**Integration tests** (Vitest, `*.integration.test.ts`) invoke route handlers directly against an in-memory SQLite database and a stubbed Docker daemon. They are the workhorse of the suite — fast (sub-10s for the whole set) and cover auth, RBAC, CRUD, and state transitions without a browser.

```bash
npm test                  # run all Vitest suites (unit + integration)
npm run test:integration  # integration tests only
npm run test:watch        # watch mode
```

**E2E tests** (Playwright) exercise genuine multi-page user journeys in a real browser against a running dev server. Kept intentionally small — anything coverable at the integration layer lives there instead.

```bash
npx playwright install chromium   # first time only
npm run test:e2e
```

Run `npm run typecheck` to catch TypeScript errors before running tests.

For architecture details covering the DB dependency-injection pattern, the integration-test harness, auth fixtures, POM conventions, and the reasoning behind each decision, see [docs/TESTING.md](docs/TESTING.md).

## Development

```bash
DOCKLET_DATA_DIR=/tmp/docklet-dev-data npm run dev
```

See [CONTRIBUTING.md](docs/CONTRIBUTING.md) for contribution guidelines.
