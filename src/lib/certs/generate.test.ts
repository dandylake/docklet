import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { X509Certificate, createPrivateKey } from "crypto";

vi.mock("@/lib/config", () => ({
  setSetting: vi.fn(),
}));

import { setSetting } from "@/lib/config";
import { ensureSelfSignedCert } from "./generate";

describe("ensureSelfSignedCert", () => {
  let certsDir: string;

  beforeEach(() => {
    certsDir = mkdtempSync(join(tmpdir(), "docklet-certs-test-"));
    vi.clearAllMocks();
  });

  afterEach(() => {
    rmSync(certsDir, { recursive: true, force: true });
  });

  it("when neither cert nor key exists — generates a valid pair and records TLS settings", async () => {
    await ensureSelfSignedCert(certsDir);

    const cert = new X509Certificate(readFileSync(join(certsDir, "cert.pem")));
    expect(cert.subject).toContain("docklet");
    expect(() =>
      createPrivateKey(readFileSync(join(certsDir, "key.pem")))
    ).not.toThrow();

    expect(setSetting).toHaveBeenCalledWith("tls_cert_type", "self-signed");
    expect(setSetting).toHaveBeenCalledWith("tls_enabled", "true");
  });

  it("when both cert and key already exist — leaves them untouched", async () => {
    const certPath = join(certsDir, "cert.pem");
    const keyPath = join(certsDir, "key.pem");
    writeFileSync(certPath, "existing-cert");
    writeFileSync(keyPath, "existing-key");

    await ensureSelfSignedCert(certsDir);

    expect(readFileSync(certPath, "utf8")).toBe("existing-cert");
    expect(readFileSync(keyPath, "utf8")).toBe("existing-key");
    expect(setSetting).not.toHaveBeenCalled();
  });

  it("when the key is missing — regenerates both the cert and the key", async () => {
    const certPath = join(certsDir, "cert.pem");
    writeFileSync(certPath, "stale-cert");

    await ensureSelfSignedCert(certsDir);

    expect(existsSync(join(certsDir, "key.pem"))).toBe(true);
    const regenerated = readFileSync(certPath, "utf8");
    expect(regenerated).not.toBe("stale-cert");
    expect(() => new X509Certificate(regenerated)).not.toThrow();
  });
});
