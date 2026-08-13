import type { ArtifactStore, ProjectSource, ProjectStore } from "./host/types.js";
import type {
  BuildOutcome,
  SandboxAccess,
  SandboxLifecycle,
} from "./lifecycle/sandbox-lifecycle.js";
import type { RepairStrategy } from "./repair/types.js";

export type BuildServiceResult = {
  project: ProjectSource;
  outcome: BuildOutcome;
  artifactPath?: string;
  access?: SandboxAccess;
};

export class GeneratedCodeBuildService {
  constructor(
    private readonly projects: ProjectStore,
    private readonly artifacts: ArtifactStore,
    private readonly lifecycle: SandboxLifecycle,
    private readonly repairStrategy?: RepairStrategy,
    private readonly maximumRepairAttempts = 1,
  ) {}

  async build(projectId: string): Promise<BuildServiceResult> {
    let project = await this.projects.load(projectId);
    let outcome = await this.lifecycle.build(project);
    let attempt = 0;

    while (
      !outcome.ok &&
      this.repairStrategy &&
      attempt < this.maximumRepairAttempts
    ) {
      attempt += 1;
      const repaired = await this.repairStrategy.repair({
        project,
        failure: outcome.failure,
        attempt,
      });
      if (!repaired) break;

      await this.projects.save(repaired);
      project = repaired;
      outcome = await this.lifecycle.build(project);
    }

    if (!outcome.ok) return { project, outcome };

    const artifact = await this.lifecycle.packageArtifact(outcome);
    const artifactPath = await this.artifacts.save({
      projectId: project.id,
      revision: project.revision,
      content: artifact,
    });
    const previewResult = await this.lifecycle.startPreview(project.id);
    if (previewResult.exitCode !== 0 || previewResult.status === "failed") {
      throw new Error(
        `Preview startup failed: ${previewResult.stderr || previewResult.logs}`,
      );
    }
    const access = await this.lifecycle.access(project.id);

    return { project, outcome, artifactPath, access };
  }
}
