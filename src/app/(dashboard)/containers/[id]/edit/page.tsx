"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import FormInput from "@/components/ui/FormInput";
import FormSection from "@/components/ui/FormSection";
import DynamicList from "@/components/ui/DynamicList";
import type { CreateContainerInput } from "@/lib/docker/types";

interface PortEntry {
  containerPort: string;
  hostPort: string;
  protocol: "tcp" | "udp";
}

interface VolumeEntry {
  containerPath: string;
  mode: "rw" | "ro";
}

interface EnvEntry {
  key: string;
  value: string;
}

interface FormState {
  name: string;
  image: string;
  ports: PortEntry[];
  env: EnvEntry[];
  volumes: VolumeEntry[];
  restartPolicy: string;
  hostname: string;
  cmd: string;
  cpuLimit: string;
  memoryLimit: string;
  tty: boolean;
  stdin: boolean;
}

function createInputToFormState(s: CreateContainerInput): FormState {
  return {
    name: s.name,
    image: s.image,
    ports: (s.ports ?? []).map((p) => ({
      containerPort: String(p.containerPort),
      hostPort: p.hostPort ? String(p.hostPort) : "",
      protocol: p.protocol,
    })),
    env: (s.env ?? []).map((e) => {
      const idx = e.indexOf("=");
      return {
        key: idx >= 0 ? e.slice(0, idx) : e,
        value: idx >= 0 ? e.slice(idx + 1) : "",
      };
    }),
    volumes: (s.volumes ?? []).map((v) => ({
      containerPath: v.containerPath,
      mode: (v.mode === "ro" ? "ro" : "rw") as "rw" | "ro",
    })),
    restartPolicy: s.restartPolicy?.name || "no",
    hostname: s.hostname ?? "",
    cmd: (s.cmd ?? []).join(" "),
    cpuLimit: s.resources?.cpuLimit ? String(s.resources.cpuLimit) : "",
    memoryLimit: s.resources?.memoryLimit
      ? String(Math.round(s.resources.memoryLimit / (1024 * 1024)))
      : "",
    tty: s.tty ?? false,
    stdin: s.stdin ?? false,
  };
}

export default function EditContainerPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [form, setForm] = useState<FormState | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/containers/${id}/spec`);
        if (res.ok) {
          const spec: CreateContainerInput = await res.json();
          setForm(createInputToFormState(spec));
        }
      } catch {
        // Silently fail
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading || !form) {
    return (
      <div className="flex justify-center py-12">
        <div className="spinner" />
      </div>
    );
  }

  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => prev && { ...prev, [key]: value });
    setErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = "Name is required";
    if (!form.image.trim()) errs.image = "Image is required";
    if (form.cpuLimit && (isNaN(Number(form.cpuLimit)) || Number(form.cpuLimit) <= 0)) {
      errs.cpuLimit = "Must be a positive number";
    }
    if (form.memoryLimit && (isNaN(Number(form.memoryLimit)) || Number(form.memoryLimit) <= 0)) {
      errs.memoryLimit = "Must be a positive number (MB)";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      const payload = {
        name: form.name.trim(),
        image: form.image.trim(),
        ports: form.ports
          .filter((p) => p.containerPort)
          .map((p) => ({
            containerPort: parseInt(p.containerPort, 10),
            hostPort: p.hostPort ? parseInt(p.hostPort, 10) : undefined,
            protocol: p.protocol,
          })),
        env: form.env
          .filter((e) => e.key)
          .map((e) => `${e.key}=${e.value}`),
        volumes: form.volumes
          .filter((v) => v.containerPath.trim())
          .map((v) => ({ containerPath: v.containerPath.trim(), mode: v.mode })),
        restartPolicy: { name: form.restartPolicy },
        hostname: form.hostname || undefined,
        cmd: form.cmd.trim() ? form.cmd.trim().split(/\s+/) : undefined,
        resources: {
          cpuLimit: form.cpuLimit ? Number(form.cpuLimit) : undefined,
          memoryLimit: form.memoryLimit
            ? Number(form.memoryLimit) * 1024 * 1024
            : undefined,
        },
        tty: form.tty,
        stdin: form.stdin,
      };
      const res = await fetch(`/api/containers/${id}/update`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const { id: newId } = await res.json();
        router.push(`/containers/${newId}`);
      } else {
        const data = await res.json();
        setErrors({ submit: data.error || "Failed to update container" });
      }
    } catch {
      setErrors({ submit: "Failed to update container" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <PageHeader
        title="Edit Container"
        actions={
          <Button type="submit" variant="primary" loading={submitting}>
            Save Changes
          </Button>
        }
      />

      <div className="bg-yellow-900/30 border border-yellow-700/50 rounded-lg p-4 text-yellow-300 text-sm">
        Editing a container will recreate it. Data in non-mounted paths will be
        lost.
      </div>

      {errors.submit && (
        <div className="bg-red-900/50 border border-red-700 rounded-lg p-4 text-red-300">
          {errors.submit}
        </div>
      )}

      <FormSection title="Basic">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormInput
            label="Container Name"
            value={form.name}
            onChange={(e) => updateField("name", e.target.value)}
            error={errors.name}
          />
          <FormInput
            label="Image"
            value={form.image}
            onChange={(e) => updateField("image", e.target.value)}
            error={errors.image}
          />
        </div>
      </FormSection>

      <FormSection title="Ports">
        <DynamicList
          items={form.ports}
          onAdd={() =>
            updateField("ports", [
              ...form.ports,
              { containerPort: "", hostPort: "", protocol: "tcp" as const },
            ])
          }
          onRemove={(i) =>
            updateField("ports", form.ports.filter((_, idx) => idx !== i))
          }
          addLabel="Add Port"
          renderItem={(port, i) => (
            <div className="grid grid-cols-3 gap-2">
              <input
                className="input-field"
                placeholder="Host Port"
                value={port.hostPort}
                onChange={(e) => {
                  const next = [...form.ports];
                  next[i] = { ...next[i], hostPort: e.target.value };
                  updateField("ports", next);
                }}
              />
              <input
                className="input-field"
                placeholder="Container Port"
                value={port.containerPort}
                onChange={(e) => {
                  const next = [...form.ports];
                  next[i] = { ...next[i], containerPort: e.target.value };
                  updateField("ports", next);
                }}
              />
              <select
                className="input-field"
                value={port.protocol}
                onChange={(e) => {
                  const next = [...form.ports];
                  next[i] = { ...next[i], protocol: e.target.value as "tcp" | "udp" };
                  updateField("ports", next);
                }}
              >
                <option value="tcp">TCP</option>
                <option value="udp">UDP</option>
              </select>
            </div>
          )}
        />
      </FormSection>

      <FormSection title="Environment Variables">
        <DynamicList
          items={form.env}
          onAdd={() =>
            updateField("env", [...form.env, { key: "", value: "" }])
          }
          onRemove={(i) =>
            updateField("env", form.env.filter((_, idx) => idx !== i))
          }
          addLabel="Add Variable"
          renderItem={(envVar, i) => (
            <div className="grid grid-cols-2 gap-2">
              <input
                className="input-field"
                placeholder="KEY"
                value={envVar.key}
                onChange={(e) => {
                  const next = [...form.env];
                  next[i] = { ...next[i], key: e.target.value };
                  updateField("env", next);
                }}
              />
              <input
                className="input-field"
                placeholder="value"
                value={envVar.value}
                onChange={(e) => {
                  const next = [...form.env];
                  next[i] = { ...next[i], value: e.target.value };
                  updateField("env", next);
                }}
              />
            </div>
          )}
        />
      </FormSection>

      <FormSection
        title="Volumes"
        description="Specify container paths to mount. Host directories are auto-created under the data directory."
      >
        <DynamicList
          items={form.volumes}
          onAdd={() =>
            updateField("volumes", [
              ...form.volumes,
              { containerPath: "", mode: "rw" as const },
            ])
          }
          onRemove={(i) =>
            updateField("volumes", form.volumes.filter((_, idx) => idx !== i))
          }
          addLabel="Add Volume"
          renderItem={(vol, i) => (
            <div className="grid grid-cols-2 gap-2">
              <input
                className="input-field"
                placeholder="/data"
                value={vol.containerPath}
                onChange={(e) => {
                  const next = [...form.volumes];
                  next[i] = { ...next[i], containerPath: e.target.value };
                  updateField("volumes", next);
                }}
              />
              <select
                className="input-field"
                value={vol.mode}
                onChange={(e) => {
                  const next = [...form.volumes];
                  next[i] = { ...next[i], mode: e.target.value as "rw" | "ro" };
                  updateField("volumes", next);
                }}
              >
                <option value="rw">Read/Write</option>
                <option value="ro">Read Only</option>
              </select>
            </div>
          )}
        />
      </FormSection>

      <FormSection title="Configuration">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="form-label">Restart Policy</label>
            <select
              className="input-field"
              value={form.restartPolicy}
              onChange={(e) => updateField("restartPolicy", e.target.value)}
            >
              <option value="no">No</option>
              <option value="always">Always</option>
              <option value="unless-stopped">Unless Stopped</option>
              <option value="on-failure">On Failure</option>
            </select>
          </div>
          <FormInput
            label="Hostname"
            value={form.hostname}
            onChange={(e) => updateField("hostname", e.target.value)}
          />
          <FormInput
            label="Command"
            value={form.cmd}
            onChange={(e) => updateField("cmd", e.target.value)}
            helpText="Override the default command"
          />
        </div>
      </FormSection>

      <FormSection title="Resource Limits">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormInput
            label="CPU Limit (cores)"
            value={form.cpuLimit}
            onChange={(e) => updateField("cpuLimit", e.target.value)}
            placeholder="e.g., 0.5"
            error={errors.cpuLimit}
          />
          <FormInput
            label="Memory Limit (MB)"
            value={form.memoryLimit}
            onChange={(e) => updateField("memoryLimit", e.target.value)}
            placeholder="e.g., 512"
            error={errors.memoryLimit}
          />
        </div>
      </FormSection>

      <FormSection title="Terminal Options">
        <div className="flex gap-6">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.tty}
              onChange={(e) => updateField("tty", e.target.checked)}
              className="rounded border-gray-600 bg-gray-700 text-blue-500"
            />
            <span className="text-sm">Allocate TTY</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.stdin}
              onChange={(e) => updateField("stdin", e.target.checked)}
              className="rounded border-gray-600 bg-gray-700 text-blue-500"
            />
            <span className="text-sm">Attach STDIN</span>
          </label>
        </div>
      </FormSection>
    </form>
  );
}
