import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./session", () => ({
  getSession: vi.fn(),
}));

vi.mock("@/lib/docker/containers", () => ({
  isSelfContainer: vi.fn(),
}));

import { requireSelfContainerAccess, AuthError } from "./middleware";
import { getSession } from "./session";
import { isSelfContainer } from "@/lib/docker/containers";

const adminSession = { userId: 1, username: "alice", role: "admin" };
const modSession = { userId: 2, username: "bob", role: "mod" };
const userSession = { userId: 3, username: "carol", role: "user" };

describe("requireSelfContainerAccess", () => {
  beforeEach(() => {
    vi.mocked(getSession).mockReset();
    vi.mocked(isSelfContainer).mockReset();
  });

  it("when no session cookie is present — throws AuthError(401)", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    vi.mocked(isSelfContainer).mockReturnValue(false);

    await expect(requireSelfContainerAccess("abc123")).rejects.toMatchObject({
      status: 401,
      message: "Unauthorized",
    });
    await expect(requireSelfContainerAccess("abc123")).rejects.toBeInstanceOf(
      AuthError,
    );
  });

  it("when a non-admin targets the self-container — throws AuthError(403)", async () => {
    vi.mocked(getSession).mockResolvedValue(modSession);
    vi.mocked(isSelfContainer).mockReturnValue(true);

    await expect(requireSelfContainerAccess("self123")).rejects.toMatchObject({
      status: 403,
      message: "Forbidden",
    });
  });

  it("when a regular user targets the self-container — throws AuthError(403)", async () => {
    vi.mocked(getSession).mockResolvedValue(userSession);
    vi.mocked(isSelfContainer).mockReturnValue(true);

    await expect(requireSelfContainerAccess("self123")).rejects.toMatchObject({
      status: 403,
    });
  });

  it("when an admin targets the self-container — returns the session", async () => {
    vi.mocked(getSession).mockResolvedValue(adminSession);
    vi.mocked(isSelfContainer).mockReturnValue(true);

    await expect(requireSelfContainerAccess("self123")).resolves.toEqual(
      adminSession,
    );
  });

  it("when a non-admin targets a non-self container — returns the session", async () => {
    vi.mocked(getSession).mockResolvedValue(modSession);
    vi.mocked(isSelfContainer).mockReturnValue(false);

    await expect(requireSelfContainerAccess("other456")).resolves.toEqual(
      modSession,
    );
  });

  it("when an admin targets a non-self container — returns the session", async () => {
    vi.mocked(getSession).mockResolvedValue(adminSession);
    vi.mocked(isSelfContainer).mockReturnValue(false);

    await expect(requireSelfContainerAccess("other456")).resolves.toEqual(
      adminSession,
    );
  });
});
