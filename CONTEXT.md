# Context

Domain vocabulary for docklet. Terms here are load-bearing: they name a concept that appears in code and shapes how modules are designed. Add a term when a new concept earns its name; sharpen one when grilling exposes a fuzzy edge.

## Glossary

### Self-container

The Docker container that Docklet itself runs in, when Docklet is deployed as a container (the typical production setup). Identified at runtime by matching a container ID against `os.hostname()`, which Docker sets to the 12-character short container ID. Returns false when Docklet runs outside a container (e.g. in dev via `npm run dev`).

**Policy:** the self-container is invisible and untouchable to non-admins. Admins see and manage it normally.

**Lives in code as:** `isSelfContainer(id)` in [src/lib/docker/containers.ts](src/lib/docker/containers.ts) and `requireSelfContainerAccess(id)` in [src/lib/auth/middleware.ts](src/lib/auth/middleware.ts). The policy is enforced per-id by container routes under [src/app/api/containers/[id]/](src/app/api/containers/[id]/) and as a list filter in [src/app/api/containers/route.ts](src/app/api/containers/route.ts).
