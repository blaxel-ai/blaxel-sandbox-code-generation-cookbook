import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  FileArtifactStore,
  FileProjectStore,
  ProjectNotFoundError,
  projectStorageKey,
} from "../src/index.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) =>
      rm(root, { recursive: true, force: true }),
    ),
  );
});

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "codegen-store-"));
  temporaryRoots.push(root);
  return root;
}

describe("file-backed stores", () => {
  it("builds bounded storage keys from separator-heavy project ids", () => {
    const key = projectStorageKey(
      `${"-".repeat(100_000)}Project Alpha${"-".repeat(100_000)}`,
    );

    expect(key).toMatch(/^Project-Alpha-[a-f0-9]{12}$/);
    expect(key.length).toBeLessThanOrEqual(61);
  });

  it("keeps project ids with the same readable slug isolated", async () => {
    const root = await temporaryRoot();
    const projects = new FileProjectStore(path.join(root, "projects"));
    const artifacts = new FileArtifactStore(path.join(root, "artifacts"));

    await projects.save({ id: "team/a", revision: 1, files: { "a.ts": "a" } });
    await projects.save({ id: "team?a", revision: 2, files: { "b.ts": "b" } });
    const firstArtifact = await artifacts.save({
      projectId: "team/a",
      revision: 1,
      content: new TextEncoder().encode("first"),
    });
    const secondArtifact = await artifacts.save({
      projectId: "team?a",
      revision: 1,
      content: new TextEncoder().encode("second"),
    });

    expect((await projects.load("team/a")).files).toEqual({ "a.ts": "a" });
    expect((await projects.load("team?a")).files).toEqual({ "b.ts": "b" });
    expect(firstArtifact).not.toBe(secondArtifact);
    expect(await readFile(firstArtifact, "utf8")).toBe("first");
    expect(await readFile(secondArtifact, "utf8")).toBe("second");
  });

  it("distinguishes a missing project from invalid stored state", async () => {
    const root = await temporaryRoot();
    const projectDirectory = path.join(root, "projects");
    const projects = new FileProjectStore(projectDirectory);

    await expect(projects.load("missing")).rejects.toBeInstanceOf(
      ProjectNotFoundError,
    );

    await mkdir(projectDirectory, { recursive: true });
    await writeFile(
      path.join(projectDirectory, `${projectStorageKey("corrupt")}.json`),
      "not-json",
      "utf8",
    );

    await expect(projects.load("corrupt")).rejects.toBeInstanceOf(SyntaxError);
  });

  it("rejects stored data for a different project id", async () => {
    const root = await temporaryRoot();
    const projects = new FileProjectStore(path.join(root, "projects"));
    await projects.save({ id: "expected", revision: 1, files: {} });
    const projectPath = path.join(
      root,
      "projects",
      `${projectStorageKey("expected")}.json`,
    );
    await writeFile(
      projectPath,
      `${JSON.stringify({ id: "different", revision: 1, files: {} })}\n`,
      "utf8",
    );

    await expect(projects.load("expected")).rejects.toThrow(
      "Stored project id does not match expected",
    );
  });
});
