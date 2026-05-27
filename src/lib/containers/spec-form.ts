import type { CreateContainerInput, PortBinding } from "@/lib/docker/types";

export type PortEntry = {
  containerPort: string;
  hostPort: string;
  protocol: "tcp" | "udp";
};

export type EnvEntry = { key: string; value: string };

export type VolumeEntry = { containerPath: string; mode: "rw" | "ro" };

/** Fields a CreateContainerInput may carry that the form does not render.
 *  Anything stored here flows back unchanged through specFormToInput, so
 *  editing a container does not silently drop labels, network mode, or
 *  maximumRetryCount just because the UI lacks inputs for them. */
export type SpecFormPassthrough = {
  labels?: Record<string, string>;
  networkMode?: string;
  maximumRetryCount?: number;
};

export type SpecFormState = {
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
  _passthrough: SpecFormPassthrough;
};

export type SpecFormErrors = Partial<Record<keyof SpecFormState, string>>;

export type SpecFormResult =
  | { ok: true; input: CreateContainerInput }
  | { ok: false; errors: SpecFormErrors };

export const defaultSpecForm: SpecFormState = {
  name: "",
  image: "",
  ports: [],
  env: [],
  volumes: [],
  restartPolicy: "no",
  hostname: "",
  cmd: "",
  cpuLimit: "",
  memoryLimit: "",
  tty: false,
  stdin: false,
  _passthrough: {},
};

export function specFormFromInput(input: CreateContainerInput): SpecFormState {
  const passthrough: SpecFormPassthrough = {};
  if (input.labels && Object.keys(input.labels).length > 0) {
    passthrough.labels = input.labels;
  }
  if (input.networkMode) passthrough.networkMode = input.networkMode;
  if (input.restartPolicy?.maximumRetryCount != null) {
    passthrough.maximumRetryCount = input.restartPolicy.maximumRetryCount;
  }

  return {
    name: input.name,
    image: input.image,
    ports: (input.ports ?? []).map((p) => ({
      containerPort: String(p.containerPort),
      hostPort: p.hostPort != null ? String(p.hostPort) : "",
      protocol: p.protocol,
    })),
    env: (input.env ?? []).map((e) => {
      const idx = e.indexOf("=");
      return {
        key: idx >= 0 ? e.slice(0, idx) : e,
        value: idx >= 0 ? e.slice(idx + 1) : "",
      };
    }),
    volumes: (input.volumes ?? []).map((v) => ({
      containerPath: v.containerPath,
      mode: v.mode === "ro" ? "ro" : "rw",
    })),
    restartPolicy: input.restartPolicy?.name || "no",
    hostname: input.hostname ?? "",
    cmd: (input.cmd ?? []).join(" "),
    cpuLimit:
      input.resources?.cpuLimit != null ? String(input.resources.cpuLimit) : "",
    memoryLimit:
      input.resources?.memoryLimit != null
        ? String(Math.round(input.resources.memoryLimit / (1024 * 1024)))
        : "",
    tty: input.tty ?? false,
    stdin: input.stdin ?? false,
    _passthrough: passthrough,
  };
}

export function specFormToInput(form: SpecFormState): SpecFormResult {
  const errors: SpecFormErrors = {};
  if (!form.name.trim()) errors.name = "Name is required";
  if (!form.image.trim()) errors.image = "Image is required";
  if (
    form.cpuLimit &&
    (isNaN(Number(form.cpuLimit)) || Number(form.cpuLimit) <= 0)
  ) {
    errors.cpuLimit = "Must be a positive number";
  }
  if (
    form.memoryLimit &&
    (isNaN(Number(form.memoryLimit)) || Number(form.memoryLimit) <= 0)
  ) {
    errors.memoryLimit = "Must be a positive number (MB)";
  }
  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  const ports: PortBinding[] = form.ports
    .filter((p) => p.containerPort)
    .map((p) => ({
      containerPort: parseInt(p.containerPort, 10),
      hostPort: p.hostPort ? parseInt(p.hostPort, 10) : undefined,
      protocol: p.protocol,
    }));

  const env = form.env
    .filter((e) => e.key)
    .map((e) => `${e.key}=${e.value}`);

  const volumes = form.volumes
    .filter((v) => v.containerPath.trim())
    .map((v) => ({ containerPath: v.containerPath.trim(), mode: v.mode }));

  const cmd = form.cmd.trim() ? form.cmd.trim().split(/\s+/) : undefined;
  const cpuLimit = form.cpuLimit ? Number(form.cpuLimit) : undefined;
  const memoryLimit = form.memoryLimit
    ? Number(form.memoryLimit) * 1024 * 1024
    : undefined;

  const input: CreateContainerInput = {
    name: form.name.trim(),
    image: form.image.trim(),
  };
  if (ports.length > 0) input.ports = ports;
  if (env.length > 0) input.env = env;
  if (volumes.length > 0) input.volumes = volumes;
  if (form.restartPolicy) {
    input.restartPolicy = {
      name: form.restartPolicy,
      ...(form._passthrough.maximumRetryCount != null
        ? { maximumRetryCount: form._passthrough.maximumRetryCount }
        : {}),
    };
  }
  if (form._passthrough.networkMode) {
    input.networkMode = form._passthrough.networkMode;
  }
  if (form.hostname) input.hostname = form.hostname;
  if (cmd) input.cmd = cmd;
  if (form._passthrough.labels) input.labels = form._passthrough.labels;
  if (cpuLimit != null || memoryLimit != null) {
    input.resources = { cpuLimit, memoryLimit };
  }
  if (form.tty) input.tty = true;
  if (form.stdin) input.stdin = true;

  return { ok: true, input };
}
