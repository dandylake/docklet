import { describe, it, expect, vi, beforeEach } from "vitest";

const mockImage = {
  remove: vi.fn(),
};

const mockDocker = {
  listImages: vi.fn(),
  getImage: vi.fn(() => mockImage),
  pull: vi.fn(),
};

vi.mock("./client", () => ({
  getDocker: () => mockDocker,
}));

import { listImages, removeImage, parsePullProgress } from "./images";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listImages", () => {
  it("maps dockerode output to ImageSummary", async () => {
    mockDocker.listImages.mockResolvedValue([
      {
        Id: "sha256:abc123",
        RepoTags: ["nginx:latest"],
        Size: 142000000,
        Created: 1700000000,
      },
    ]);

    const result = await listImages();
    expect(result).toEqual([
      {
        id: "sha256:abc123",
        repoTags: ["nginx:latest"],
        size: 142000000,
        created: 1700000000,
      },
    ]);
  });

  it("when an image has a <none>:<none> tag — filters it out", async () => {
    mockDocker.listImages.mockResolvedValue([
      {
        Id: "sha256:abc123",
        RepoTags: ["<none>:<none>"],
        Size: 100,
        Created: 1700000000,
      },
      {
        Id: "sha256:def456",
        RepoTags: ["alpine:latest"],
        Size: 7000000,
        Created: 1700000000,
      },
    ]);

    const result = await listImages();
    expect(result).toHaveLength(1);
    expect(result[0].repoTags).toEqual(["alpine:latest"]);
  });

  it("when an image has no tags — filters it out", async () => {
    mockDocker.listImages.mockResolvedValue([
      {
        Id: "sha256:abc123",
        RepoTags: undefined,
        Size: 100,
        Created: 1700000000,
      },
    ]);

    const result = await listImages();
    expect(result).toEqual([]);
  });

  it("when docker returns no images — returns an empty array", async () => {
    mockDocker.listImages.mockResolvedValue([]);
    const result = await listImages();
    expect(result).toEqual([]);
  });
});

describe("removeImage", () => {
  it("removes an image with force=false by default", async () => {
    mockImage.remove.mockResolvedValue(undefined);
    await removeImage("sha256:abc123");
    expect(mockDocker.getImage).toHaveBeenCalledWith("sha256:abc123");
    expect(mockImage.remove).toHaveBeenCalledWith({ force: false });
  });

  it("when force is requested — passes the force flag to docker", async () => {
    mockImage.remove.mockResolvedValue(undefined);
    await removeImage("sha256:abc123", true);
    expect(mockImage.remove).toHaveBeenCalledWith({ force: true });
  });
});

describe("parsePullProgress", () => {
  it("parses a valid JSON progress line", () => {
    const result = parsePullProgress('{"status":"Pulling fs layer","id":"abc123"}');
    expect(result).toEqual({ status: "Pulling fs layer", id: "abc123" });
  });

  it("parses a progress line containing progressDetail", () => {
    const result = parsePullProgress(
      '{"status":"Downloading","id":"abc123","progressDetail":{"current":1024,"total":4096}}'
    );
    expect(result?.progressDetail).toEqual({ current: 1024, total: 4096 });
  });

  it("when a valid line has surrounding whitespace — still parses it", () => {
    const result = parsePullProgress('  {"status":"Extracting"}\n');
    expect(result).toEqual({ status: "Extracting" });
  });

  it("when the input is not valid JSON — returns null", () => {
    expect(parsePullProgress("not json")).toBeNull();
  });

  it("when the input is an empty string — returns null", () => {
    expect(parsePullProgress("")).toBeNull();
  });
});
