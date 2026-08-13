import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { projectStorageKey } from "./project-storage-key.js";
import type { ProjectSource, ProjectStore } from "./types.js";

export class ProjectNotFoundError extends Error {
  constructor(readonly projectId: string) {
    super(`Project not found: ${projectId}`);
    this.name = "ProjectNotFoundError";
  }
}

export class FileProjectStore implements ProjectStore {
  constructor(private readonly rootDirectory: string) {}

  async load(projectId: string): Promise<ProjectSource> {
    let content: string;
    try {
      content = await readFile(this.projectPath(projectId), "utf8");
    } catch (error) {
      if (isMissingFile(error)) throw new ProjectNotFoundError(projectId);
      throw error;
    }

    return parseProject(content, projectId);
  }

  async save(project: ProjectSource): Promise<void> {
    await mkdir(this.rootDirectory, { recursive: true });
    const destination = this.projectPath(project.id);
    const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(project, null, 2)}\n`, "utf8");
    await rename(temporary, destination);
  }

  private projectPath(projectId: string): string {
    return path.join(this.rootDirectory, `${projectStorageKey(projectId)}.json`);
  }
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

function parseProject(content: string, expectedProjectId: string): ProjectSource {
  const value: unknown = JSON.parse(content);
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Stored project ${expectedProjectId} is not an object`);
  }

  const record = value as Record<string, unknown>;
  if (record.id !== expectedProjectId) {
    throw new Error(`Stored project id does not match ${expectedProjectId}`);
  }
  if (!Number.isInteger(record.revision) || Number(record.revision) < 1) {
    throw new Error(`Stored project ${expectedProjectId} has an invalid revision`);
  }
  if (
    typeof record.files !== "object" ||
    record.files === null ||
    Array.isArray(record.files) ||
    Object.values(record.files).some((entry) => typeof entry !== "string")
  ) {
    throw new Error(`Stored project ${expectedProjectId} has invalid files`);
  }

  return {
    id: record.id,
    revision: Number(record.revision),
    files: { ...(record.files as Record<string, string>) },
  };
}
