"use client";

import FormInput from "@/components/ui/FormInput";
import FormSection from "@/components/ui/FormSection";
import DynamicList from "@/components/ui/DynamicList";
import type { SpecFormState, SpecFormErrors } from "@/lib/containers/spec-form";

type Props = {
  form: SpecFormState;
  errors: SpecFormErrors;
  onChange: <K extends keyof SpecFormState>(key: K, value: SpecFormState[K]) => void;
  placeholders?: boolean;
};

export default function ContainerSpecFormFields({
  form,
  errors,
  onChange,
  placeholders = false,
}: Props) {
  return (
    <>
      <FormSection title="Basic">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormInput
            label="Container Name"
            value={form.name}
            onChange={(e) => onChange("name", e.target.value)}
            placeholder={placeholders ? "my-container" : undefined}
            error={errors.name}
          />
          <FormInput
            label="Image"
            value={form.image}
            onChange={(e) => onChange("image", e.target.value)}
            placeholder={placeholders ? "nginx:latest" : undefined}
            error={errors.image}
          />
        </div>
      </FormSection>

      <FormSection title="Ports" description="Map container ports to host ports">
        <DynamicList
          items={form.ports}
          onAdd={() =>
            onChange("ports", [
              ...form.ports,
              { containerPort: "", hostPort: "", protocol: "tcp" as const },
            ])
          }
          onRemove={(i) =>
            onChange(
              "ports",
              form.ports.filter((_, idx) => idx !== i)
            )
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
                  onChange("ports", next);
                }}
              />
              <input
                className="input-field"
                placeholder="Container Port"
                value={port.containerPort}
                onChange={(e) => {
                  const next = [...form.ports];
                  next[i] = { ...next[i], containerPort: e.target.value };
                  onChange("ports", next);
                }}
              />
              <select
                className="input-field"
                value={port.protocol}
                onChange={(e) => {
                  const next = [...form.ports];
                  next[i] = { ...next[i], protocol: e.target.value as "tcp" | "udp" };
                  onChange("ports", next);
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
            onChange("env", [...form.env, { key: "", value: "" }])
          }
          onRemove={(i) =>
            onChange(
              "env",
              form.env.filter((_, idx) => idx !== i)
            )
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
                  onChange("env", next);
                }}
              />
              <input
                className="input-field"
                placeholder="value"
                value={envVar.value}
                onChange={(e) => {
                  const next = [...form.env];
                  next[i] = { ...next[i], value: e.target.value };
                  onChange("env", next);
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
            onChange("volumes", [
              ...form.volumes,
              { containerPath: "", mode: "rw" as const },
            ])
          }
          onRemove={(i) =>
            onChange(
              "volumes",
              form.volumes.filter((_, idx) => idx !== i)
            )
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
                  onChange("volumes", next);
                }}
              />
              <select
                className="input-field"
                value={vol.mode}
                onChange={(e) => {
                  const next = [...form.volumes];
                  next[i] = { ...next[i], mode: e.target.value as "rw" | "ro" };
                  onChange("volumes", next);
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
              onChange={(e) => onChange("restartPolicy", e.target.value)}
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
            onChange={(e) => onChange("hostname", e.target.value)}
            placeholder={placeholders ? "Optional" : undefined}
          />
          <FormInput
            label="Command"
            value={form.cmd}
            onChange={(e) => onChange("cmd", e.target.value)}
            placeholder={placeholders ? "e.g., nginx -g 'daemon off;'" : undefined}
            helpText="Override the default command"
          />
        </div>
      </FormSection>

      <FormSection title="Resource Limits" description="Optional CPU and memory constraints">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormInput
            label="CPU Limit (cores)"
            value={form.cpuLimit}
            onChange={(e) => onChange("cpuLimit", e.target.value)}
            placeholder={placeholders ? "e.g., 0.5" : undefined}
            error={errors.cpuLimit}
          />
          <FormInput
            label="Memory Limit (MB)"
            value={form.memoryLimit}
            onChange={(e) => onChange("memoryLimit", e.target.value)}
            placeholder={placeholders ? "e.g., 512" : undefined}
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
              onChange={(e) => onChange("tty", e.target.checked)}
              className="rounded border-gray-600 bg-gray-700 text-blue-500"
            />
            <span className="text-sm">Allocate TTY</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.stdin}
              onChange={(e) => onChange("stdin", e.target.checked)}
              className="rounded border-gray-600 bg-gray-700 text-blue-500"
            />
            <span className="text-sm">Attach STDIN</span>
          </label>
        </div>
      </FormSection>
    </>
  );
}
