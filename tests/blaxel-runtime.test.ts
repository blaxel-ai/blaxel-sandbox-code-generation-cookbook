import AdmZip from "adm-zip";
import { describe, expect, it, vi } from "vitest";
import { BlaxelRuntimeAdapter } from "../src/runtime/blaxel-runtime.js";

function processResult(overrides: Record<string, unknown> = {}) {
  return {
    name: "test-process",
    command: "true",
    completedAt: new Date().toISOString(),
    exitCode: 0,
    logs: "completed",
    pid: "1",
    startedAt: new Date().toISOString(),
    status: "completed",
    stderr: "",
    stdout: "completed",
    workingDir: "/workspace",
    ...overrides,
  };
}

function runtimeFixture() {
  const process = {
    exec: vi.fn(async (_input: Record<string, unknown>) => processResult()),
    wait: vi.fn(
      async (_identifier: string, _options?: Record<string, unknown>) =>
        processResult(),
    ),
    kill: vi.fn(async (_identifier: string) => ({ message: "killed" })),
  };
  const fs = {
    rm: vi.fn(async (_path: string, _recursive?: boolean) => ({ message: "removed" })),
    mkdir: vi.fn(async (_path: string) => ({ message: "created" })),
    writeTree: vi.fn(
      async (_files: unknown[], _destinationPath: string) => ({ message: "written" }),
    ),
    writeBinary: vi.fn(async (_path: string, _content: Buffer) => ({
      message: "written",
    })),
    read: vi.fn(async (_path: string) => "content"),
    readBinary: vi.fn(async (_path: string) => new Blob(["binary"])),
  };
  const session = {
    name: "session-1",
    url: "https://session.example.test",
    token: "session-token",
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  };
  const sessions = {
    createIfExpired: vi.fn(
      async (_options: Record<string, unknown>, _delta: number) => session,
    ),
  };
  const previewToken = {
    value: "private preview token",
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  };
  const preview = {
    name: "app-preview",
    metadata: { name: "app-preview" },
    spec: {
      url: "https://preview.example.test",
      port: 4173,
      public: false,
      ttl: "1h",
    },
    tokens: { create: vi.fn(async (_expiresAt: Date) => previewToken) },
  };
  const previews = {
    createIfNotExists: vi.fn(async (_input: Record<string, unknown>) => preview),
    delete: vi.fn(async (_name: string) => ({ status: "DELETED" })),
  };
  const sandbox = {
    metadata: { name: "codegen-project" },
    status: "DEPLOYED",
    fs,
    process,
    sessions,
    previews,
  };
  const sdk = {
    get: vi.fn(async (_name: string) => sandbox),
    createIfNotExists: vi.fn(async (_input: Record<string, unknown>) => sandbox),
    delete: vi.fn(async (_name: string) => sandbox),
  };

  return { fs, preview, previews, process, sandbox, sdk, sessions };
}

describe("BlaxelRuntimeAdapter", () => {
  it("refuses to reset the Sandbox working root", async () => {
    const fixture = runtimeFixture();
    const runtime = new BlaxelRuntimeAdapter({}, fixture.sdk as never);

    await expect(
      runtime.resetDirectory("codegen-project", "//workspace/"),
    ).rejects.toThrow("Refusing to reset protected Sandbox directory");
    expect(fixture.fs.rm).not.toHaveBeenCalled();
  });

  it("normalizes a response-status 404 into a missing workload error", async () => {
    const fixture = runtimeFixture();
    fixture.sdk.get.mockRejectedValueOnce({ response: { status: 404 } });
    const runtime = new BlaxelRuntimeAdapter({}, fixture.sdk as never);

    await expect(runtime.connectSandbox("missing-project")).rejects.toMatchObject(
      {
        origin: "platform",
        code: "WORKLOAD_NOT_FOUND",
        retryable: false,
        status: 404,
      },
    );
  });

  it("starts long commands asynchronously and waits through the process API", async () => {
    const fixture = runtimeFixture();
    fixture.process.exec.mockResolvedValueOnce(
      processResult({ name: "install-dependencies", status: "running" }),
    );
    const runtime = new BlaxelRuntimeAdapter({}, fixture.sdk as never);

    const result = await runtime.execute({
      sandboxName: "codegen-project",
      name: "install-dependencies",
      command: "npm install",
      workingDirectory: "/workspace",
      timeoutSeconds: 180,
    });

    expect(fixture.process.exec).toHaveBeenCalledWith(
      expect.objectContaining({ waitForCompletion: false }),
    );
    expect(fixture.process.exec.mock.calls[0]?.[0]).not.toHaveProperty("timeout");
    expect(fixture.process.wait).toHaveBeenCalledWith("install-dependencies", {
      maxWait: 180_000,
      interval: 1000,
    });
    expect(result.status).toBe("completed");
  });

  it("kills a command when the long-process wait fails", async () => {
    const fixture = runtimeFixture();
    fixture.process.exec.mockResolvedValueOnce(
      processResult({ name: "runtime-build", status: "running" }),
    );
    fixture.process.wait.mockRejectedValueOnce(new Error("timed out"));
    const runtime = new BlaxelRuntimeAdapter({}, fixture.sdk as never);

    await expect(
      runtime.execute({
        sandboxName: "codegen-project",
        name: "build",
        command: "npm run build",
        workingDirectory: "/workspace",
        timeoutSeconds: 180,
      }),
    ).rejects.toThrow("timed out");
    expect(fixture.process.kill).toHaveBeenCalledWith("runtime-build");
  });

  it("passes an explicit renewal window when reusing browser sessions", async () => {
    const fixture = runtimeFixture();
    const runtime = new BlaxelRuntimeAdapter({}, fixture.sdk as never);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await runtime.createSession("codegen-project", expiresAt, 60_000);

    expect(fixture.sessions.createIfExpired).toHaveBeenCalledWith(
      { expiresAt },
      60_000,
    );
  });

  it("creates a header-backed access grant for a private preview", async () => {
    const fixture = runtimeFixture();
    const runtime = new BlaxelRuntimeAdapter({}, fixture.sdk as never);
    const tokenExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

    const grant = await runtime.createPreview({
      sandboxName: "codegen-project",
      name: "app-preview",
      port: 4173,
      public: false,
      ttl: "1h",
      tokenExpiresAt,
    });

    expect(fixture.preview.tokens.create).toHaveBeenCalledWith(tokenExpiresAt);
    expect(grant.token).toBe("private preview token");
    expect(grant.url).toBe("https://preview.example.test");
    expect(grant.requestHeaders).toEqual({
      "X-Blaxel-Preview-Token": "private preview token",
    });
  });

  it("replaces a preview when its access configuration drifted", async () => {
    const fixture = runtimeFixture();
    fixture.previews.createIfNotExists
      .mockResolvedValueOnce({
        ...fixture.preview,
        spec: { ...fixture.preview.spec, public: true },
      })
      .mockResolvedValueOnce(fixture.preview);
    const runtime = new BlaxelRuntimeAdapter({}, fixture.sdk as never);

    await runtime.createPreview({
      sandboxName: "codegen-project",
      name: "app-preview",
      port: 4173,
      public: false,
      ttl: "1h",
      tokenExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });

    expect(fixture.previews.delete).toHaveBeenCalledWith("app-preview");
    expect(fixture.previews.createIfNotExists).toHaveBeenCalledTimes(2);
  });

  it("uses lifecycle policy, external id, and optional domains at creation", async () => {
    const fixture = runtimeFixture();
    const runtime = new BlaxelRuntimeAdapter({}, fixture.sdk as never);

    await runtime.createSandbox({
      name: "codegen-project",
      image: "custom-image",
      memoryMb: 4096,
      region: "us-pdx-1",
      expirationPolicies: [
        { type: "ttl-idle", value: "7d", action: "delete" },
      ],
      externalId: "project-123",
      allowedDomains: ["registry.npmjs.org"],
      labels: { "managed-by": "cookbook" },
    });

    expect(fixture.sdk.createIfNotExists).toHaveBeenCalledWith(
      expect.objectContaining({
        externalId: "project-123",
        lifecycle: {
          expirationPolicies: [
            { type: "ttl-idle", value: "7d", action: "delete" },
          ],
        },
        network: { proxy: { allowedDomains: ["registry.npmjs.org"] } },
      }),
    );
  });

  it("uploads a zip archive when a projection crosses the bulk threshold", async () => {
    const fixture = runtimeFixture();
    const runtime = new BlaxelRuntimeAdapter(
      { archiveFileThreshold: 1 },
      fixture.sdk as never,
    );

    await runtime.writeFiles("codegen-project", "/workspace", [
      { path: "src/App.tsx", content: "export const App = 1;" },
    ]);

    expect(fixture.fs.writeTree).not.toHaveBeenCalled();
    expect(fixture.fs.writeBinary).toHaveBeenCalledOnce();
    const archiveBytes = fixture.fs.writeBinary.mock.calls[0]?.[1];
    const archive = new AdmZip(archiveBytes);
    expect(archive.readAsText("src/App.tsx")).toBe("export const App = 1;");
    expect(fixture.process.exec).toHaveBeenCalledWith(
      expect.objectContaining({
        command: expect.stringContaining("unzip -oq"),
        timeout: 60,
        waitForCompletion: true,
      }),
    );
    expect(fixture.process.exec).toHaveBeenCalledWith(
      expect.objectContaining({
        command: expect.stringContaining(`trap 'rm -f "$archive"' EXIT`),
      }),
    );
  });
});
