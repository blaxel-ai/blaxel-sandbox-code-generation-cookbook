import { describe, expect, it } from "vitest";
import { GeneratedCodeBuildService } from "../src/build-service.js";
import type {
  ArtifactStore,
  ProjectSource,
  ProjectStore,
} from "../src/host/types.js";
import { SandboxLifecycle } from "../src/lifecycle/sandbox-lifecycle.js";
import { StaticRepairStrategy } from "../src/repair/static-repair.js";
import type {
  CommandInput,
  CommandResult,
} from "../src/runtime/types.js";
import { FakeRuntimeAdapter } from "./support/fake-runtime.js";

class MemoryProjectStore implements ProjectStore {
  constructor(public project: ProjectSource) {}
  async load() {
    return this.project;
  }
  async save(project: ProjectSource) {
    this.project = project;
  }
}

class MemoryArtifactStore implements ArtifactStore {
  content?: Uint8Array;
  async save(input: {
    projectId: string;
    revision: number;
    content: Uint8Array;
  }) {
    this.content = input.content;
    return `/artifacts/${input.projectId}/${input.revision}.tgz`;
  }
}

class PreviewFailureRuntime extends FakeRuntimeAdapter {
  override async execute(input: CommandInput): Promise<CommandResult> {
    if (input.name === "preview-server") {
      return {
        name: input.name,
        exitCode: 1,
        status: "failed",
        logs: "port 4173 unavailable",
        stdout: "",
        stderr: "port 4173 unavailable",
      };
    }
    return super.execute(input);
  }
}

describe("GeneratedCodeBuildService", () => {
  it("repairs a code failure, saves the host revision, and exports the artifact", async () => {
    const projects = new MemoryProjectStore({
      id: "generated-component",
      revision: 1,
      files: {
        "package.json": "{}",
        "src/App.tsx": "const accent: string = 42;",
      },
    });
    const artifacts = new MemoryArtifactStore();
    const runtime = new FakeRuntimeAdapter();
    const service = new GeneratedCodeBuildService(
      projects,
      artifacts,
      new SandboxLifecycle(runtime, { image: "test-image" }),
      new StaticRepairStrategy({
        "src/App.tsx": 'const accent = "#4e8dff";',
      }),
    );

    const result = await service.build("generated-component");

    expect(result.outcome.ok).toBe(true);
    expect(result.project.revision).toBe(2);
    expect(projects.project.revision).toBe(2);
    expect(result.artifactPath).toContain("/artifacts/generated-component/2.tgz");
    expect(new TextDecoder().decode(artifacts.content)).toBe("compiled-artifact");
    expect(result.access?.preview.url).toContain("preview.example.test");
    expect(runtime.creates).toBe(1);
    expect(runtime.previews).toBe(1);
    expect(runtime.sessions).toBe(1);
  });

  it("returns an actionable code failure when no repair is available", async () => {
    const projects = new MemoryProjectStore({
      id: "generated-component",
      revision: 1,
      files: {
        "package.json": "{}",
        "src/App.tsx": "const accent: string = 42;",
      },
    });
    const artifacts = new MemoryArtifactStore();
    const service = new GeneratedCodeBuildService(
      projects,
      artifacts,
      new SandboxLifecycle(new FakeRuntimeAdapter(), { image: "test-image" }),
    );

    const result = await service.build("generated-component");

    expect(result.outcome.ok).toBe(false);
    if (!result.outcome.ok) {
      expect(result.outcome.failure.step).toBe("type-check");
      expect(result.outcome.failure.result.stderr).toContain(
        "not assignable to type 'string'",
      );
    }
    expect(result.artifactPath).toBeUndefined();
  });

  it("does not issue access when the preview process fails to start", async () => {
    const projects = new MemoryProjectStore({
      id: "generated-component",
      revision: 1,
      files: {
        "package.json": "{}",
        "src/App.tsx": "export function App() { return null; }",
      },
    });
    const runtime = new PreviewFailureRuntime();
    const service = new GeneratedCodeBuildService(
      projects,
      new MemoryArtifactStore(),
      new SandboxLifecycle(runtime, { image: "test-image" }),
    );

    await expect(service.build("generated-component")).rejects.toThrow(
      "Preview startup failed: port 4173 unavailable",
    );
    expect(runtime.previews).toBe(0);
    expect(runtime.sessions).toBe(0);
  });
});
