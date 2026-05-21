import { describe, it, expect } from "vitest";
import { useTestDb } from "@/test/db";
import { username, password } from "@/test/faker";
import { users } from "@/lib/db/schema";
import { createUser, listUsers, updateUser, deleteUser } from "./service";

describe("users/service", () => {
  const ctx = useTestDb();

  describe("createUser", () => {
    it("creates a user that appears in listUsers", async () => {
      const name = username();
      await createUser({ username: name, password: password(), role: "admin" }, ctx.get());
      const list = await listUsers(ctx.get());
      expect(list).toHaveLength(1);
      expect(list[0].username).toBe(name);
    });

    it("when the username is already taken — rejects with 409", async () => {
      const name = username();
      await createUser({ username: name, password: password(), role: "user" }, ctx.get());
      await expect(
        createUser({ username: name, password: password(), role: "user" }, ctx.get())
      ).rejects.toMatchObject({ status: 409 });
    });

    it("when the username contains spaces — rejects with 400", async () => {
      await expect(
        createUser({ username: "bad name", password: password(), role: "user" }, ctx.get())
      ).rejects.toMatchObject({ status: 400 });
    });

    it("when the password is shorter than 8 characters — rejects with 400", async () => {
      await expect(
        createUser({ username: username(), password: "abc", role: "user" }, ctx.get())
      ).rejects.toMatchObject({ status: 400 });
    });
  });

  describe("listUsers", () => {
    it("returns a DTO that does not expose passwordHash", async () => {
      await createUser({ username: username(), password: password(), role: "admin" }, ctx.get());
      const list = await listUsers(ctx.get());
      expect(list[0]).not.toHaveProperty("passwordHash");
    });

    it("orders users by creation time, oldest first", async () => {
      const db = ctx.get();
      const insert = (name: string, createdAt: Date) =>
        db
          .insert(users)
          .values({
            username: name,
            passwordHash: "hash",
            role: "user",
            createdAt,
            updatedAt: createdAt,
          })
          .run();
      insert("newer", new Date(2_000));
      insert("older", new Date(1_000));
      const list = await listUsers(db);
      expect(list.map((u) => u.username)).toEqual(["older", "newer"]);
    });
  });

  describe("updateUser", () => {
    it("when the role is changed — persists the new role", async () => {
      const user = await createUser(
        { username: username(), password: password(), role: "admin" },
        ctx.get()
      );
      // A second admin so the first can be demoted without hitting the last-admin guard.
      await createUser({ username: username(), password: password(), role: "admin" }, ctx.get());
      const updated = await updateUser(user.id, { role: "user" }, ctx.get());
      expect(updated.role).toBe("user");
    });

    it("when only the password is patched — leaves the role unchanged", async () => {
      const user = await createUser(
        { username: username(), password: password(), role: "mod" },
        ctx.get()
      );
      const updated = await updateUser(user.id, { password: password() }, ctx.get());
      expect(updated.role).toBe("mod");
    });

    it("when the password is updated — refreshes updatedAt", async () => {
      const user = await createUser(
        { username: username(), password: password(), role: "user" },
        ctx.get()
      );
      const updated = await updateUser(user.id, { password: password() }, ctx.get());
      expect(updated.updatedAt).toBeGreaterThanOrEqual(user.updatedAt);
    });

    it("when demoting the last remaining admin — rejects with 400", async () => {
      const admin = await createUser(
        { username: username(), password: password(), role: "admin" },
        ctx.get()
      );
      await expect(
        updateUser(admin.id, { role: "user" }, ctx.get())
      ).rejects.toMatchObject({ status: 400 });
    });

    it("when the patch is empty — rejects with 400", async () => {
      const user = await createUser(
        { username: username(), password: password(), role: "user" },
        ctx.get()
      );
      await expect(updateUser(user.id, {}, ctx.get())).rejects.toMatchObject({ status: 400 });
    });

    it("when the user does not exist — rejects with 404", async () => {
      await expect(
        updateUser(9999, { role: "user" }, ctx.get())
      ).rejects.toMatchObject({ status: 404 });
    });
  });

  describe("deleteUser", () => {
    it("when deleting your own account — rejects with 400", async () => {
      const user = await createUser(
        { username: username(), password: password(), role: "admin" },
        ctx.get()
      );
      await expect(deleteUser(user.id, user.id, ctx.get())).rejects.toMatchObject({ status: 400 });
    });

    it("when deleting the last remaining admin — rejects with 400", async () => {
      const admin = await createUser(
        { username: username(), password: password(), role: "admin" },
        ctx.get()
      );
      const actor = await createUser(
        { username: username(), password: password(), role: "user" },
        ctx.get()
      );
      await expect(
        deleteUser(admin.id, actor.id, ctx.get())
      ).rejects.toMatchObject({ status: 400 });
    });

    it("when deleting an admin that is not the last — removes the user", async () => {
      const target = await createUser(
        { username: username(), password: password(), role: "admin" },
        ctx.get()
      );
      const survivor = await createUser(
        { username: username(), password: password(), role: "admin" },
        ctx.get()
      );
      await deleteUser(target.id, survivor.id, ctx.get());
      const list = await listUsers(ctx.get());
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe(survivor.id);
    });
  });
});
