import { describe, expect, it, vi } from "vitest";
import type { ProjectSource } from "../src/host/types.js";
import { SandboxLifecycle } from "../src/lifecycle/sandbox-lifecycle.js";
import { sandboxNameForProject } from "../src/names.js";
import { FakeRuntimeAdapter } from "./support/fake-runtime.js";

const project = (revision = 1): ProjectSource => ({
  id: "project-123",
  revision,
  files: {
    "package.json": "{}",
    "src/App.tsx": "export function App() { return null; }",
  },
});

describe("SandboxLifecycle", () => {
  it("creates and projects a missing Sandbox", async () => {
    const runtime = new FakeRuntimeAdapter();
    const lifecycle = new SandboxLifecycle(runtime, { image: "test-image" });

    const prepared = await lifecycle.prepare(project());

    expect(prepared.replaced).toBe(true);
    expect(prepared.projected).toBe(true);
    expect(runtime.creates).toBe(1);
    expect(runtime.projections).toBe(2);
    expect(runtime.createInputs[0]).toMatchObject({
      externalId: project().id,
      expirationPolicies: [
        { type: "ttl-idle", value: "7d", action: "delete" },
      ],
    });
  });

  it("reuses the retained working copy for the same revision", async () => {
    const runtime = new FakeRuntimeAdapter();
    const lifecycle = new SandboxLifecycle(runtime, { image: "test-image" });

    await lifecycle.prepare(project());
    await lifecycle.prepare(project());

    expect(runtime.creates).toBe(1);
    expect(runtime.projections).toBe(2);
  });

  it("projects a new host revision into the retained Sandbox", async () => {
    const runtime = new FakeRuntimeAdapter();
    const lifecycle = new SandboxLifecycle(runtime, { image: "test-image" });

    await lifecycle.prepare(project(1));
    const prepared = await lifecycle.prepare(project(2));

    expect(prepared.projected).toBe(true);
    expect(runtime.creates).toBe(1);
    expect(runtime.projections).toBe(4);
  });

  it("uses a project lockfile when dependencies are first installed", async () => {
    const runtime = new FakeRuntimeAdapter();
    const lifecycle = new SandboxLifecycle(runtime, { image: "test-image" });

    await lifecycle.build({
      ...project(),
      files: {
        ...project().files,
        "package-lock.json": "{}",
      },
    });

    expect(runtime.executionInputs[0]?.command).toContain(
      "if test -f package-lock.json; then npm ci",
    );
    expect(runtime.executionInputs[0]?.command).toContain("else npm install");
  });

  it("retries a temporarily unavailable Sandbox without resetting it", async () => {
    const runtime = new FakeRuntimeAdapter();
    const sandboxName = sandboxNameForProject(project().id);
    runtime.sandboxes.set(sandboxName, { files: new Map() });
    runtime.connectErrors.push({
      origin: "platform",
      code: "WORKLOAD_UNAVAILABLE",
      retryable: true,
    });
    const sleep = vi.fn(async () => undefined);
    const lifecycle = new SandboxLifecycle(
      runtime,
      { image: "test-image" },
      { sleep },
    );

    const prepared = await lifecycle.prepare(project());

    expect(prepared.replaced).toBe(false);
    expect(runtime.creates).toBe(0);
    expect(runtime.deletes).toBe(0);
    expect(sleep).toHaveBeenCalledOnce();
  });

  it("replaces an unavailable Sandbox only after the retry budget", async () => {
    const runtime = new FakeRuntimeAdapter();
    const sandboxName = sandboxNameForProject(project().id);
    runtime.sandboxes.set(sandboxName, { files: new Map() });
    runtime.connectErrors.push({
      origin: "platform",
      code: "WORKLOAD_UNAVAILABLE",
      retryable: true,
    });
    runtime.connectErrors.push({
      origin: "platform",
      code: "WORKLOAD_UNAVAILABLE",
      retryable: true,
    });
    let now = 0;
    const lifecycle = new SandboxLifecycle(
      runtime,
      { image: "test-image", retryMaximumElapsedMs: 400 },
      { now: () => now, sleep: async (delay) => void (now += delay) },
    );

    const prepared = await lifecycle.prepare(project());

    expect(prepared.replaced).toBe(true);
    expect(runtime.deletes).toBe(1);
    expect(runtime.creates).toBe(1);
    expect(prepared.projected).toBe(true);
    expect(now).toBe(400);
  });

  it("uses the complete retry budget before replacing a Sandbox", async () => {
    const runtime = new FakeRuntimeAdapter();
    const sandboxName = sandboxNameForProject(project().id);
    runtime.sandboxes.set(sandboxName, { files: new Map() });
    for (let attempt = 0; attempt < 8; attempt += 1) {
      runtime.connectErrors.push({
        origin: "platform",
        code: "WORKLOAD_UNAVAILABLE",
        retryable: true,
      });
    }
    let now = 0;
    const lifecycle = new SandboxLifecycle(
      runtime,
      { image: "test-image" },
      { now: () => now, sleep: async (delay) => void (now += delay) },
    );

    const prepared = await lifecycle.prepare(project());

    expect(prepared.replaced).toBe(true);
    expect(now).toBe(60_000);
    expect(runtime.deletes).toBe(1);
  });

  it("does not claim replacement when deletion fails", async () => {
    const runtime = new FakeRuntimeAdapter();
    const sandboxName = sandboxNameForProject(project().id);
    runtime.sandboxes.set(sandboxName, { files: new Map() });
    runtime.connectErrors.push({
      origin: "platform",
      code: "WORKLOAD_UNAVAILABLE",
      retryable: true,
    });
    runtime.connectErrors.push({
      origin: "platform",
      code: "WORKLOAD_UNAVAILABLE",
      retryable: true,
    });
    runtime.deleteErrors.push({
      origin: "platform",
      code: "DELETE_FAILED",
      status: 500,
    });
    let now = 0;
    const lifecycle = new SandboxLifecycle(
      runtime,
      { image: "test-image", retryMaximumElapsedMs: 1 },
      { now: () => now, sleep: async (delay) => void (now += delay) },
    );

    await expect(lifecycle.prepare(project())).rejects.toMatchObject({
      code: "DELETE_FAILED",
    });
    expect(runtime.deletes).toBe(1);
    expect(runtime.creates).toBe(0);
  });

  it("recreates after deletion reports the Sandbox is already absent", async () => {
    const runtime = new FakeRuntimeAdapter();
    const sandboxName = sandboxNameForProject(project().id);
    runtime.sandboxes.set(sandboxName, { files: new Map() });
    runtime.connectErrors.push({
      origin: "platform",
      code: "WORKLOAD_UNAVAILABLE",
      retryable: true,
    });
    runtime.connectErrors.push({
      origin: "platform",
      code: "WORKLOAD_UNAVAILABLE",
      retryable: true,
    });
    runtime.deleteErrors.push({
      origin: "platform",
      code: "WORKLOAD_NOT_FOUND",
      status: 404,
    });
    let now = 0;
    const lifecycle = new SandboxLifecycle(
      runtime,
      { image: "test-image", retryMaximumElapsedMs: 1 },
      { now: () => now, sleep: async (delay) => void (now += delay) },
    );

    const prepared = await lifecycle.prepare(project());

    expect(prepared.replaced).toBe(true);
    expect(runtime.deletes).toBe(1);
    expect(runtime.creates).toBe(1);
  });

  it("does not replace a Sandbox for an application-origin error", async () => {
    const runtime = new FakeRuntimeAdapter();
    runtime.connectErrors.push({
      origin: "application",
      code: "ROUTE_NOT_FOUND",
      status: 404,
    });
    const lifecycle = new SandboxLifecycle(runtime, { image: "test-image" });

    await expect(lifecycle.prepare(project())).rejects.toMatchObject({
      code: "ROUTE_NOT_FOUND",
    });
    expect(runtime.creates).toBe(0);
    expect(runtime.deletes).toBe(0);
  });

  it("rejects source paths that can escape the working directory", async () => {
    const runtime = new FakeRuntimeAdapter();
    const lifecycle = new SandboxLifecycle(runtime, { image: "test-image" });

    await expect(
      lifecycle.prepare({
        ...project(),
        files: { "../outside.txt": "not allowed" },
      }),
    ).rejects.toThrow("Project file path is not allowed");
    expect(runtime.creates).toBe(0);
  });
});
