# Testing

Three layers, each with a distinct job:

| Layer | Tool | Location |
|-------|------|----------|
| Unit | Vitest | `src/lib/**/*.test.ts` |
| Integration | Vitest | `src/app/api/**/*.integration.test.ts` |
| E2E | Playwright | `e2e/*.spec.ts` |

- **Unit**: one module in isolation, external dependencies mocked at the import boundary.
- **Integration**: route handlers invoked in-process against an in-memory DB and a fake Docker daemon. The workhorse, covering auth, RBAC, validation, CRUD, and state transitions without a browser.
- **E2E**: real browser against a real dev server. Reserved for multi-page journeys a browser uniquely validates.

```bash
npm test                  # unit + integration
npm run test:integration  # integration only
npm run test:watch        # watch mode
npm run test:e2e          # E2E (first run: npx playwright install chromium)
npm run typecheck         # run before tests to catch type errors
```

Run one file with `npx vitest run <path>`. Test names follow `"when <condition> — <expected result>"`.

---

## Test isolation

Every test gets fresh state. Two helpers handle this; pick by what the code under test reads.

**DB-backed code uses `useTestDb()`** (`src/test/db.ts`). It returns a `{ get }` handle: `beforeEach` builds a migrated in-memory SQLite DB and installs it as the singleton, `afterEach` resets it.

```typescript
const ctx = useTestDb();

it("when the username is taken — rejects with 409", async () => {
  await createUser({ username: "ada", password, role: "user" }, ctx.get());
  await expect(createUser({ username: "ada", password, role: "user" }, ctx.get()))
    .rejects.toMatchObject({ status: 409 });
});
```

Services accept `db: Db = getDb()` as an optional last argument, so a test passes `ctx.get()` explicitly. Routes call `getDb()` with no args; `useTestDb()` swaps the singleton, so handlers see the in-memory DB too.

**Filesystem-backed code uses `useTempDataDir()`** (`src/test/data-dir.ts`). `src/lib/db/index.ts` freezes `DATA_DIR` at module load, so the data directory cannot change once the module is imported. `useTempDataDir()` points `DOCKLET_DATA_DIR` at a fresh temp directory in `beforeAll`; the test then `await import()`s the module under test so the env var is read first.

```typescript
const dataDir = useTempDataDir();
let service: typeof import("./service");

beforeAll(async () => { service = await import("./service"); });
```

---

## Unit tests

Tests sit next to their module (`foo.ts` produces `foo.test.ts`).

**Mock external dependencies at the module boundary.** `vi.mock()` is hoisted above imports, so the real imports come after it:

```typescript
const mockDocker = { listContainers: vi.fn(), getContainer: vi.fn(() => mockContainer) };
vi.mock("./client", () => ({ getDocker: () => mockDocker }));

import { listContainers } from "./containers";

beforeEach(() => vi.clearAllMocks());
```

To stub one function of a built-in module while keeping the rest, spread the original:

```typescript
vi.mock("fs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("fs")>()),
  mkdirSync: vi.fn(),
}));
```

**Time-dependent code uses fake timers**, never a real sleep:

```typescript
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2025-01-01T00:00:00Z")); });
afterEach(() => vi.useRealTimers());
// advance with vi.advanceTimersByTime(ms)
```

**Errors are asserted by shape**, not message. Service functions throw `AppError`, an `Error` with a `status` field:

```typescript
await expect(remove("")).rejects.toMatchObject({ status: 400 });
```

**Realistic data** comes from `src/test/faker.ts` (`username()`, `password()`). Do not hand-roll local generators.

---

## Integration tests

Each file owns one route family and lives beside it (`api/users/route.ts` produces `route.integration.test.ts`).

```typescript
vi.mock("@/lib/docker/client", () => ({ getDocker: () => globalThis.__testDocker! }));

import { POST } from "./route";
import { useTestDb } from "@/test/db";
import { loginAs } from "@/test/auth";
import { buildRequest, callHandler } from "@/test/request";
import { installFakeDocker, getFakeDocker } from "@/test/docker";

describe("POST /api/images/pull", () => {
  const ctx = useTestDb();
  beforeEach(() => installFakeDocker());

  it("when called as a non-admin — returns 403 and pulls nothing", async () => {
    await loginAs(ctx.get(), { role: "user" });
    const res = await callHandler(POST, buildRequest({ method: "POST", body: { image: "nginx" } }));
    expect(res.status).toBe(403);
    expect(await getFakeDocker().listImages()).toHaveLength(0);
  });
});
```

Assert the observable outcomes that apply: the **response** (status, body shape), **DB state** read back through the service, **Docker fake state**, and **cookies**. Unit tests already cover business logic; integration tests validate the full request path: middleware, validation, role checks, and side effects.

### Test helpers (`src/test/`)

| File | Provides |
|------|----------|
| `setup.ts` | Vitest setup file; mocks `next/headers` cookies against a global jar |
| `db.ts` | `createTestDb()`, `useTestDb()` for an in-memory DB and singleton swap |
| `data-dir.ts` | `useTempDataDir()` for an isolated temp `DOCKLET_DATA_DIR` |
| `auth.ts` | `loginAs(db, { role })`, `createTestUser(db, opts)` |
| `request.ts` | `buildRequest()`, `callHandler()` |
| `docker.ts` | `FakeDocker`, an in-memory dockerode replacement |
| `faker.ts` | `username()`, `password()` realistic-data helpers |

---

## E2E tests

```bash
npx playwright install chromium   # first time only
npm run test:e2e
```

Playwright runs three projects in sequence: **`setup`** (resets the DB, removes orphan `e2e-*` containers), then **`auth`** (runs `auth.spec.ts` against an empty DB so the setup wizard works, creating the `e2e-admin` account), then **`chromium`** (the remaining specs). All specs run serially because the dev server's SQLite file is shared state.

Key decisions:

- **DB reset** truncates rows (`DELETE FROM ...`) instead of deleting the file. The dev server holds an open file descriptor, so `rm` would strand it on a stale inode.
- **Auth fixtures** (`adminPage`, `userPage`, `modPage` in `e2e/fixtures/auth.fixtures.ts`) log in through the API, not the UI: faster, and immune to hydration races. `webServer` sets `E2E_DISABLE_RATE_LIMIT=1` so repeated logins do not hit the 5-per-15-minute limit.
- **Data directory** is `./tmp/docklet-e2e-data`, isolated from local dev.
- **Page Objects** (`e2e/pom/`) expose named locators and bake wait conditions into action methods. Prefer `getByLabel` and `getByRole`; fall back to `getByTestId` for dynamic UI.

E2E is deliberately small. RBAC status codes, validation, and CRUD persistence live in the integration suite. What remains is genuine multi-page journeys: setup to dashboard, login to containers, create to detail to list, and cross-page settings state.
