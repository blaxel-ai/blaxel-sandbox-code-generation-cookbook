import { randomUUID } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { projectStorageKey } from "./project-storage-key.js";
import type { ArtifactStore } from "./types.js";

export class FileArtifactStore implements ArtifactStore {
  constructor(private readonly rootDirectory: string) {}

  async save(input: {
    projectId: string;
    revision: number;
    content: Uint8Array;
  }): Promise<string> {
    const directory = path.join(
      this.rootDirectory,
      projectStorageKey(input.projectId),
    );
    await mkdir(directory, { recursive: true });

    const destination = path.join(directory, `revision-${input.revision}.tgz`);
    const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporary, input.content);
    await rename(temporary, destination);
    return destination;
  }
}
