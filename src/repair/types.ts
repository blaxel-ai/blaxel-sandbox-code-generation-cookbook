import type { ProjectSource } from "../host/types.js";
import type { BuildFailure } from "../lifecycle/sandbox-lifecycle.js";

export interface RepairStrategy {
  repair(input: {
    project: ProjectSource;
    failure: BuildFailure;
    attempt: number;
  }): Promise<ProjectSource | null>;
}
