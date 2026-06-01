import { z } from "zod/v4";
import { join } from "path";
import { writeFileSync, unlinkSync, existsSync } from "fs";
import { jsonRoute, multipartRoute } from "@/lib/api/route";
import { AppError } from "@/lib/errors";
import { getAllSettings, setSetting } from "@/lib/config";
import { getDataDir } from "@/lib/db";
import { ensureSelfSignedCert } from "@/lib/certs/generate";

// Hidden settings that should never be exposed to the client
const HIDDEN_KEYS = ["jwt_secret"];

const settingsPutSchema = z.record(z.string(), z.string());

export const GET = jsonRoute({
  auth: "admin",
  handler: () => {
    const all = getAllSettings();
    for (const key of HIDDEN_KEYS) delete all[key];
    return all;
  },
});

export const PUT = jsonRoute<Record<string, string>, z.infer<typeof settingsPutSchema>>({
  auth: "admin",
  body: settingsPutSchema,
  handler: ({ body }) => {
    for (const [key, value] of Object.entries(body)) {
      if (HIDDEN_KEYS.includes(key)) continue;
      setSetting(key, value);
    }
    return { success: true };
  },
});

// TLS certificate upload
export const POST = multipartRoute({
  auth: "admin",
  handler: async ({ formData }) => {
    const cert = formData.get("cert") as File | null;
    const key = formData.get("key") as File | null;

    if (!cert || !key) {
      throw new AppError(400, "Both cert and key files are required");
    }

    const certsDir = join(getDataDir(), "certs");
    const certContent = Buffer.from(await cert.arrayBuffer());
    const keyContent = Buffer.from(await key.arrayBuffer());

    writeFileSync(join(certsDir, "cert.pem"), certContent);
    writeFileSync(join(certsDir, "key.pem"), keyContent, { mode: 0o600 });

    setSetting("tls_enabled", "true");
    setSetting("tls_cert_type", "custom");

    return {
      success: true,
      message: "TLS certificates uploaded. Restart Docklet to apply.",
    };
  },
});

// Revert to self-signed certificate
export const DELETE = jsonRoute({
  auth: "admin",
  handler: async () => {
    const certsDir = join(getDataDir(), "certs");

    for (const file of ["cert.pem", "key.pem"]) {
      const filePath = join(certsDir, file);
      if (existsSync(filePath)) {
        unlinkSync(filePath);
      }
    }

    await ensureSelfSignedCert(certsDir);

    return {
      success: true,
      message: "Self-signed certificate regenerated. Restart Docklet to apply.",
    };
  },
});
