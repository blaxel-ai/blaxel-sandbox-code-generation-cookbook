import type { ProjectSource } from "../host/types.js";
import { previewNameForProject, sandboxNameForProject } from "../names.js";
import type {
  CommandInput,
  CommandResult,
  PreviewGrant,
  RuntimeAdapter,
  SessionGrant,
  SandboxExpirationPolicy,
  SandboxHandle,
} from "../runtime/types.js";
import {
  classifyRuntimeError,
  isApplicationMissingPath,
  runtimeErrorDetails,
} from "./error-policy.js";

export type BuildStep = {
  name: string;
  command: string;
  timeoutSeconds: number;
};

export type SandboxLifecycleConfig = {
  region: string;
  image: string;
  memoryMb: number;
  expirationPolicies: SandboxExpirationPolicy[];
  allowedDomains: string[];
  workingDirectory: string;
  previewPort: number;
  previewPublic: boolean;
  previewTtl: string;
  sessionDurationMs: number;
  sessionRenewalWindowMs: number;
  retryInitialDelayMs: number;
  retryMaximumDelayMs: number;
  retryMaximumElapsedMs: number;
  buildSteps: BuildStep[];
  artifactCommand: string;
  artifactPath: string;
  previewCommand: string;
};

export type SandboxLifecycleOptions = Pick<SandboxLifecycleConfig, "image"> &
  Partial<Omit<SandboxLifecycleConfig, "image">>;

export type PreparedSandbox = {
  sandbox: SandboxHandle;
  projectId: string;
  revision: number;
  projected: boolean;
  replaced: boolean;
};

export type BuildFailure = {
  sandboxName: string;
  revision: number;
  step: string;
  result: CommandResult;
};

export type BuildOutcome =
  | {
      ok: true;
      sandboxName: string;
      revision: number;
      steps: CommandResult[];
      projected: boolean;
      replaced: boolean;
    }
  | {
      ok: false;
      sandboxName: string;
      revision: number;
      steps: CommandResult[];
      projected: boolean;
      replaced: boolean;
      failure: BuildFailure;
    };

export type SandboxAccess = {
  session: SessionGrant;
  preview: PreviewGrant;
};

const DEFAULT_CONFIG: Omit<SandboxLifecycleConfig, "image"> = {
  region: "us-pdx-1",
  memoryMb: 4096,
  expirationPolicies: [
    { type: "ttl-idle", value: "7d", action: "delete" },
  ],
  allowedDomains: [],
  workingDirectory: "/workspace/project",
  previewPort: 4173,
  previewPublic: false,
  previewTtl: "1h",
  sessionDurationMs: 10 * 60 * 1000,
  sessionRenewalWindowMs: 60 * 1000,
  retryInitialDelayMs: 500,
  retryMaximumDelayMs: 30_000,
  retryMaximumElapsedMs: 60_000,
  buildSteps: [
    {
      name: "install-dependencies",
      command:
        "test -d node_modules || if test -f package-lock.json; then npm ci --ignore-scripts --no-audit --no-fund; else npm install --ignore-scripts --no-audit --no-fund; fi",
      timeoutSeconds: 180,
    },
    {
      name: "type-check",
      command: "npm run typecheck",
      timeoutSeconds: 120,
    },
    {
      name: "build",
      command: "npm run build",
      timeoutSeconds: 180,
    },
  ],
  artifactCommand: "tar -czf /tmp/generated-artifact.tgz -C dist .",
  artifactPath: "/tmp/generated-artifact.tgz",
  previewCommand: "npm run preview -- --host 0.0.0.0",
};

type LifecycleDependencies = {
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => number;
};

export class SandboxLifecycle {
  private readonly config: SandboxLifecycleConfig;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly now: () => number;

  constructor(
    private readonly runtime: RuntimeAdapter,
    config: SandboxLifecycleOptions,
    dependencies: LifecycleDependencies = {},
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.sleep =
      dependencies.sleep ??
      ((milliseconds) =>
        new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.now = dependencies.now ?? Date.now;
  }

  async prepare(project: ProjectSource): Promise<PreparedSandbox> {
    this.validateProject(project);
    const sandboxName = sandboxNameForProject(project.id);
    const connected = await this.connectOrReplace(sandboxName, project.id);
    const markerPath = `${this.config.workingDirectory}/.cookbook-revision`;
    let currentRevision: string | undefined;

    try {
      currentRevision = await this.runtime.readText(sandboxName, markerPath);
    } catch (error) {
      if (!isApplicationMissingPath(error)) throw error;
    }

    const projected = currentRevision?.trim() !== String(project.revision);
    if (projected) {
      await this.runtime.resetDirectory(
        sandboxName,
        this.config.workingDirectory,
      );
      await this.runtime.writeFiles(
        sandboxName,
        this.config.workingDirectory,
        Object.entries(project.files).map(([path, content]) => ({
          path,
          content,
        })),
      );
      await this.runtime.writeFiles(
        sandboxName,
        this.config.workingDirectory,
        [{ path: ".cookbook-revision", content: String(project.revision) }],
      );
    }

    return {
      sandbox: connected.sandbox,
      projectId: project.id,
      revision: project.revision,
      projected,
      replaced: connected.replaced,
    };
  }

  async build(project: ProjectSource): Promise<BuildOutcome> {
    const prepared = await this.prepare(project);
    const steps: CommandResult[] = [];

    for (const step of this.config.buildSteps) {
      const result = await this.runtime.execute({
        sandboxName: prepared.sandbox.name,
        name: step.name,
        command: step.command,
        workingDirectory: this.config.workingDirectory,
        timeoutSeconds: step.timeoutSeconds,
      });
      steps.push(result);

      if (result.exitCode !== 0 || result.status === "failed") {
        return {
          ok: false,
          sandboxName: prepared.sandbox.name,
          revision: project.revision,
          steps,
          projected: prepared.projected,
          replaced: prepared.replaced,
          failure: {
            sandboxName: prepared.sandbox.name,
            revision: project.revision,
            step: step.name,
            result,
          },
        };
      }
    }

    return {
      ok: true,
      sandboxName: prepared.sandbox.name,
      revision: project.revision,
      steps,
      projected: prepared.projected,
      replaced: prepared.replaced,
    };
  }

  async packageArtifact(outcome: Extract<BuildOutcome, { ok: true }>) {
    const result = await this.runtime.execute({
      sandboxName: outcome.sandboxName,
      name: "package-artifact",
      command: this.config.artifactCommand,
      workingDirectory: this.config.workingDirectory,
      timeoutSeconds: 60,
    });

    if (result.exitCode !== 0) {
      throw new Error(`Artifact packaging failed: ${result.stderr || result.logs}`);
    }

    return this.runtime.readBinary(
      outcome.sandboxName,
      this.config.artifactPath,
    );
  }

  async access(projectId: string): Promise<SandboxAccess> {
    const sandboxName = sandboxNameForProject(projectId);
    const expiresAt = new Date(this.now() + this.config.sessionDurationMs);
    const [session, preview] = await Promise.all([
      this.runtime.createSession(
        sandboxName,
        expiresAt,
        this.config.sessionRenewalWindowMs,
      ),
      this.runtime.createPreview({
        sandboxName,
        name: previewNameForProject(projectId),
        port: this.config.previewPort,
        public: this.config.previewPublic,
        ttl: this.config.previewTtl,
        tokenExpiresAt: expiresAt,
      }),
    ]);

    return { session, preview };
  }

  async startPreview(projectId: string): Promise<CommandResult> {
    return this.runtime.execute({
      sandboxName: sandboxNameForProject(projectId),
      name: "preview-server",
      command: this.config.previewCommand,
      workingDirectory: this.config.workingDirectory,
      timeoutSeconds: 30,
      waitForCompletion: false,
      waitForPorts: [this.config.previewPort],
      keepAlive: false,
    });
  }

  async delete(projectId: string): Promise<void> {
    await this.runtime.deleteSandbox(sandboxNameForProject(projectId));
  }

  private async connectOrReplace(
    sandboxName: string,
    projectId: string,
  ): Promise<{ sandbox: SandboxHandle; replaced: boolean }> {
    const startedAt = this.now();
    let delay = this.config.retryInitialDelayMs;

    while (true) {
      try {
        return {
          sandbox: await this.runtime.connectSandbox(sandboxName),
          replaced: false,
        };
      } catch (error) {
        const disposition = classifyRuntimeError(error);

        if (disposition === "replace-sandbox") {
          return {
            sandbox: await this.createSandbox(sandboxName, projectId),
            replaced: true,
          };
        }

        if (disposition !== "retry") throw error;

        const elapsed = this.now() - startedAt;
        const remaining = this.config.retryMaximumElapsedMs - elapsed;
        if (remaining <= 0) {
          try {
            await this.runtime.deleteSandbox(sandboxName);
          } catch (error) {
            const details = runtimeErrorDetails(error);
            if (
              details.code !== "WORKLOAD_NOT_FOUND" &&
              details.status !== 404
            ) {
              throw error;
            }
          }
          return {
            sandbox: await this.createSandbox(sandboxName, projectId),
            replaced: true,
          };
        }

        await this.sleep(Math.min(delay, remaining));
        delay = Math.min(delay * 2, this.config.retryMaximumDelayMs);
      }
    }
  }

  private createSandbox(
    sandboxName: string,
    projectId: string,
  ): Promise<SandboxHandle> {
    return this.runtime.createSandbox({
      name: sandboxName,
      image: this.config.image,
      memoryMb: this.config.memoryMb,
      region: this.config.region,
      expirationPolicies: this.config.expirationPolicies,
      externalId: projectId,
      allowedDomains: this.config.allowedDomains,
      labels: {
        "project-id": projectId,
        "managed-by": "blaxel-sandbox-code-generation-cookbook",
      },
    });
  }

  private validateProject(project: ProjectSource): void {
    if (!project.id.trim()) throw new Error("Project id is required");
    if (!Number.isInteger(project.revision) || project.revision < 1) {
      throw new Error("Project revision must be a positive integer");
    }

    for (const filePath of Object.keys(project.files)) {
      const segments = filePath.split("/");
      if (
        filePath.startsWith("/") ||
        segments.includes("..") ||
        segments.includes("")
      ) {
        throw new Error(`Project file path is not allowed: ${filePath}`);
      }
    }
  }
}

export type { CommandInput };
