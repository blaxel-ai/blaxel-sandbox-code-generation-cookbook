export type ProjectSource = {
  id: string;
  revision: number;
  files: Record<string, string>;
};

export interface ProjectStore {
  load(projectId: string): Promise<ProjectSource>;
  save(project: ProjectSource): Promise<void>;
}

export interface ArtifactStore {
  save(input: {
    projectId: string;
    revision: number;
    content: Uint8Array;
  }): Promise<string>;
}
