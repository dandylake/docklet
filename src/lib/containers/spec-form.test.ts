import { describe, it, expect } from "vitest";
import type { CreateContainerInput } from "@/lib/docker/types";
import {
  defaultSpecForm,
  specFormFromInput,
  specFormToInput,
} from "./spec-form";

describe("defaultSpecForm", () => {
  it("name and image are empty but every field is initialised", () => {
    expect(defaultSpecForm.name).toBe("");
    expect(defaultSpecForm.image).toBe("");
    expect(defaultSpecForm.ports).toEqual([]);
    expect(defaultSpecForm.restartPolicy).toBe("no");
    expect(defaultSpecForm.tty).toBe(false);
    expect(defaultSpecForm._passthrough).toEqual({});
  });
});

describe("specFormFromInput", () => {
  it("name and image always populate; absent fields collapse to defaults", () => {
    const form = specFormFromInput({ name: "web", image: "nginx" });
    expect(form.name).toBe("web");
    expect(form.image).toBe("nginx");
    expect(form.ports).toEqual([]);
    expect(form.env).toEqual([]);
    expect(form.restartPolicy).toBe("no");
    expect(form.hostname).toBe("");
    expect(form.cmd).toBe("");
    expect(form.cpuLimit).toBe("");
    expect(form.memoryLimit).toBe("");
    expect(form.tty).toBe(false);
    expect(form.stdin).toBe(false);
    expect(form._passthrough).toEqual({});
  });

  it("ports stringify their numeric fields for the form inputs", () => {
    const form = specFormFromInput({
      name: "web",
      image: "nginx",
      ports: [{ containerPort: 80, hostPort: 8080, protocol: "tcp" }],
    });
    expect(form.ports).toEqual([
      { containerPort: "80", hostPort: "8080", protocol: "tcp" },
    ]);
  });

  it("a port without a host port stringifies to an empty hostPort field", () => {
    const form = specFormFromInput({
      name: "web",
      image: "nginx",
      ports: [{ containerPort: 6379, protocol: "tcp" }],
    });
    expect(form.ports[0].hostPort).toBe("");
  });

  it("env entries split on the first equals sign", () => {
    const form = specFormFromInput({
      name: "web",
      image: "nginx",
      env: ["FOO=bar", "DB_URL=postgres://u:p@host/db"],
    });
    expect(form.env).toEqual([
      { key: "FOO", value: "bar" },
      { key: "DB_URL", value: "postgres://u:p@host/db" },
    ]);
  });

  it("an env entry without an equals sign keeps the whole string as the key", () => {
    const form = specFormFromInput({
      name: "web",
      image: "nginx",
      env: ["BARE_KEY"],
    });
    expect(form.env).toEqual([{ key: "BARE_KEY", value: "" }]);
  });

  it("memory bytes round down to megabytes for the form input", () => {
    const form = specFormFromInput({
      name: "web",
      image: "nginx",
      resources: { memoryLimit: 536870912 },
    });
    expect(form.memoryLimit).toBe("512");
  });

  it("labels, networkMode, and maximumRetryCount land in _passthrough", () => {
    const form = specFormFromInput({
      name: "web",
      image: "nginx",
      labels: { app: "web" },
      networkMode: "host",
      restartPolicy: { name: "on-failure", maximumRetryCount: 5 },
    });
    expect(form._passthrough).toEqual({
      labels: { app: "web" },
      networkMode: "host",
      maximumRetryCount: 5,
    });
  });

  it("empty labels object does not pollute _passthrough", () => {
    const form = specFormFromInput({
      name: "web",
      image: "nginx",
      labels: {},
    });
    expect(form._passthrough.labels).toBeUndefined();
  });
});

describe("specFormToInput — validation", () => {
  it("reports a name error when name is blank or whitespace", () => {
    const result = specFormToInput({ ...defaultSpecForm, name: "  ", image: "nginx" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.name).toBe("Name is required");
  });

  it("reports an image error when image is blank", () => {
    const result = specFormToInput({ ...defaultSpecForm, name: "web", image: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.image).toBe("Image is required");
  });

  it("reports a cpuLimit error when cpuLimit is not a positive number", () => {
    const result = specFormToInput({
      ...defaultSpecForm,
      name: "web",
      image: "nginx",
      cpuLimit: "-1",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.cpuLimit).toMatch(/positive/);
  });

  it("reports a memoryLimit error when memoryLimit is not a positive number", () => {
    const result = specFormToInput({
      ...defaultSpecForm,
      name: "web",
      image: "nginx",
      memoryLimit: "abc",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.memoryLimit).toMatch(/positive/);
  });

  it("collects multiple field errors in a single result", () => {
    const result = specFormToInput({ ...defaultSpecForm });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.name).toBeDefined();
      expect(result.errors.image).toBeDefined();
    }
  });
});

describe("specFormToInput — conversion", () => {
  it("trims name and image and produces a minimal input", () => {
    const result = specFormToInput({
      ...defaultSpecForm,
      name: "  web  ",
      image: "  nginx  ",
      restartPolicy: "",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.input).toEqual({ name: "web", image: "nginx" });
  });

  it("filters port rows without a containerPort and parses the rest to numbers", () => {
    const result = specFormToInput({
      ...defaultSpecForm,
      name: "web",
      image: "nginx",
      restartPolicy: "",
      ports: [
        { containerPort: "", hostPort: "", protocol: "tcp" },
        { containerPort: "80", hostPort: "8080", protocol: "tcp" },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.input.ports).toEqual([
        { containerPort: 80, hostPort: 8080, protocol: "tcp" },
      ]);
    }
  });

  it("filters env rows without a key and joins each with an equals sign", () => {
    const result = specFormToInput({
      ...defaultSpecForm,
      name: "web",
      image: "nginx",
      restartPolicy: "",
      env: [
        { key: "", value: "ignored" },
        { key: "FOO", value: "bar" },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.input.env).toEqual(["FOO=bar"]);
  });

  it("converts megabytes back into bytes for memoryLimit", () => {
    const result = specFormToInput({
      ...defaultSpecForm,
      name: "web",
      image: "nginx",
      restartPolicy: "",
      memoryLimit: "512",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.input.resources?.memoryLimit).toBe(512 * 1024 * 1024);
  });

  it("splits cmd on whitespace into an argv array", () => {
    const result = specFormToInput({
      ...defaultSpecForm,
      name: "web",
      image: "nginx",
      restartPolicy: "",
      cmd: "nginx -g daemon off;",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.input.cmd).toEqual(["nginx", "-g", "daemon", "off;"]);
  });

  it("merges _passthrough labels, networkMode, and maximumRetryCount back onto the input", () => {
    const result = specFormToInput({
      ...defaultSpecForm,
      name: "web",
      image: "nginx",
      restartPolicy: "on-failure",
      _passthrough: {
        labels: { app: "web" },
        networkMode: "host",
        maximumRetryCount: 5,
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.input.labels).toEqual({ app: "web" });
      expect(result.input.networkMode).toBe("host");
      expect(result.input.restartPolicy).toEqual({
        name: "on-failure",
        maximumRetryCount: 5,
      });
    }
  });
});

describe("specFormToInput ∘ specFormFromInput — round trip", () => {
  it("preserves a rich CreateContainerInput across the round trip", () => {
    const original: CreateContainerInput = {
      name: "web",
      image: "nginx:latest",
      ports: [{ containerPort: 80, hostPort: 8080, protocol: "tcp" }],
      env: ["FOO=bar", "BAZ=qux"],
      volumes: [{ containerPath: "/data", mode: "rw" }],
      restartPolicy: { name: "on-failure", maximumRetryCount: 5 },
      networkMode: "host",
      hostname: "web-1",
      cmd: ["redis-server", "--appendonly", "yes"],
      labels: { app: "web", tier: "frontend" },
      resources: { cpuLimit: 0.5, memoryLimit: 536870912 },
      tty: true,
      stdin: true,
    };

    const result = specFormToInput(specFormFromInput(original));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.input).toEqual(original);
  });

  it("cmd args containing spaces do not survive (form has no argv quoting)", () => {
    // Documented limitation: cmd is a single whitespace-separated field, so
    // an argv element like "daemon off;" round-trips as two elements. This
    // matches the pre-deepening edit-page behavior and is out of scope for
    // the spec-form module.
    const result = specFormToInput(
      specFormFromInput({
        name: "web",
        image: "nginx",
        cmd: ["nginx", "-g", "daemon off;"],
      })
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.input.cmd).toEqual(["nginx", "-g", "daemon", "off;"]);
  });

  it("a minimal input round-trips with a normalised default restart policy", () => {
    const result = specFormToInput(
      specFormFromInput({ name: "web", image: "nginx" })
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.input).toEqual({
        name: "web",
        image: "nginx",
        restartPolicy: { name: "no" },
      });
    }
  });
});
