import { describe, it, expect } from "vitest";
import { password } from "@/test/faker";
import { hashPassword, verifyPassword } from "./password";

describe("hashPassword", () => {
  it("produces a hash distinct from the plaintext input", async () => {
    const plaintext = password();
    const hash = await hashPassword(plaintext);
    expect(hash).not.toBe(plaintext);
  });

  it("produces a different hash on each call for the same password", async () => {
    const plaintext = password();
    const hash1 = await hashPassword(plaintext);
    const hash2 = await hashPassword(plaintext);
    expect(hash1).not.toBe(hash2);
  });
});

describe("verifyPassword", () => {
  it("when the correct password is provided — returns true", async () => {
    const plaintext = password();
    const hash = await hashPassword(plaintext);
    expect(await verifyPassword(plaintext, hash)).toBe(true);
  });

  it("when a wrong password is provided — returns false", async () => {
    const hash = await hashPassword(password());
    expect(await verifyPassword(password(), hash)).toBe(false);
  });

  it("when the stored hash is malformed or empty — returns false", async () => {
    expect(await verifyPassword(password(), "not-a-real-hash")).toBe(false);
    expect(await verifyPassword(password(), "")).toBe(false);
  });
});
