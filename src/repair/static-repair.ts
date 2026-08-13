import type { ProjectSource } from "../host/types.js";
import type { RepairStrategy } from "./types.js";

export class StaticRepairStrategy implements RepairStrategy {
  constructor(private readonly replacementFiles: Record<string, string>) {}

  async repair(input: {
    project: ProjectSource;
    attempt: number;
  }): Promise<ProjectSource | null> {
    if (input.attempt > 1) return null;

    return {
      ...input.project,
      revision: input.project.revision + 1,
      files: { ...input.project.files, ...this.replacementFiles },
    };
  }
}
