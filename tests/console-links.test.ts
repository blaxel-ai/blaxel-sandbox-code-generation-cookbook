import { describe, expect, it } from "vitest";
import {
  sandboxConsoleUrl,
  sandboxInventoryUrl,
} from "../src/index.js";

describe("Blaxel console links", () => {
  it("builds encoded Sandbox detail and inventory links", () => {
    expect(sandboxConsoleUrl("team workspace", "sandbox/name")).toBe(
      "https://app.blaxel.ai/team%20workspace/global-agentic-network/sandbox/sandbox%2Fname",
    );
    expect(sandboxInventoryUrl("team workspace")).toBe(
      "https://app.blaxel.ai/team%20workspace/global-agentic-network/sandboxes",
    );
  });

  it("rejects missing link segments", () => {
    expect(() => sandboxConsoleUrl("", "sandbox")).toThrow(
      "Workspace is required",
    );
    expect(() => sandboxConsoleUrl("workspace", " ")).toThrow(
      "Sandbox name is required",
    );
  });
});
