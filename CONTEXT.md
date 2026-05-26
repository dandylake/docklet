# Context

Domain vocabulary for docklet. Terms here are load-bearing: they name a concept that appears in code and shapes how modules are designed. Add a term when a new concept earns its name; sharpen one when grilling exposes a fuzzy edge.

## Glossary

### Self-container

The Docker container that Docklet itself runs in, when Docklet is deployed as a container (the typical production setup). Identified at runtime by matching a container ID against `os.hostname()`, which Docker sets to the 12-character short container ID. Returns false when Docklet runs outside a container (e.g. in dev via `npm run dev`).

**Policy:** the self-container is invisible and untouchable to non-admins. Admins see and manage it normally.

**Lives in code as:** `isSelfContainer(id)` in [src/lib/docker/containers.ts](src/lib/docker/containers.ts) and `requireSelfContainerAccess(id)` in [src/lib/auth/middleware.ts](src/lib/auth/middleware.ts). The policy is enforced per-id by container routes under [src/app/api/containers/[id]/](src/app/api/containers/[id]/) and as a list filter in [src/app/api/containers/route.ts](src/app/api/containers/route.ts).

### Container spec

The canonical "what defines this container" shape: a `CreateContainerInput` that can be fed back into `createContainer` to produce an equivalent container. Distinct from `ContainerDetail`, which is the read-only inspect view used by display pages and includes runtime fields (state, status, mount source paths, etc.).

**Policy:** the spec is the lossy projection of the inspect view. Today it omits fields the edit form does not surface (entrypoint, labels, networkMode). It is the single source of truth the edit form pre-fills from.

**Lives in code as:** `containerDetailToCreateInput(detail)` in [src/lib/docker/containers.ts](src/lib/docker/containers.ts), exposed at `GET /api/containers/[id]/spec` in [src/app/api/containers/[id]/spec/route.ts](src/app/api/containers/[id]/spec/route.ts), and consumed by the edit form in [src/app/(dashboard)/containers/[id]/edit/page.tsx](src/app/(dashboard)/containers/[id]/edit/page.tsx).

### Recreate

Replacing a container in place: the old container is renamed aside, a new one is created claiming the original name, and the old (renamed) container is then removed. Docker has no in-place "update container config" operation, so any change to a container's spec (image, ports, env, mounts, resources, restart policy) is a recreate.

**Policy:** the new container is created in the stopped state, regardless of the prior container's run state. Recreate does not preserve the running flag; restarting the new container is the user's next action. This keeps recreate atomic-feeling: success means the new container exists, failure means it does not.

**Failure semantics:** the rename-aside dance makes failure recoverable. If creating the new container fails, the original is renamed back to its name with its id and runtime data intact (`RecreateRolledBackError`). The only catastrophic mode is rollback-rename also failing, in which case the original survives on the host under a temporary name and recovery requires manual rename (`RecreateLostError` carries that name). Post-success cleanup of the renamed original is best-effort; if it fails, the new container is still the desired state.

**Lives in code as:** `recreateContainer(id, newSpec)` in [src/lib/docker/containers.ts](src/lib/docker/containers.ts), supported by the `renameContainer` primitive in the same file. The only HTTP entry point today is `PUT /api/containers/[id]/update` in [src/app/api/containers/[id]/update/route.ts](src/app/api/containers/[id]/update/route.ts), which surfaces both rollback errors via `handleApiError` (they extend `AppError`).
