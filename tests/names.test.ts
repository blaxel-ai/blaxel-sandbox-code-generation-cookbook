import { describe, expect, it } from "vitest";
import {
  previewNameForProject,
  sandboxNameForProject,
} from "../src/names.js";

describe("resource names", () => {
  it("creates deterministic names without leading or trailing separators", () => {
    const projectId = `${"-".repeat(50_000)}Project Alpha${"-".repeat(50_000)}`;

    expect(sandboxNameForProject(projectId)).toMatch(
      /^codegen-project-alpha-[a-f0-9]{8}$/,
    );
    expect(previewNameForProject(projectId)).toMatch(/^preview-[a-f0-9]{8}$/);
  });

  it("uses a fallback for an id without alphanumeric characters", () => {
    expect(sandboxNameForProject("---")).toMatch(
      /^codegen-project-[a-f0-9]{8}$/,
    );
  });
});
