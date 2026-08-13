import "dotenv/config";
import { SandboxInstance } from "@blaxel/core";
import { afterAll, describe, expect, it } from "vitest";

const describeLive =
  process.env.RUN_BLAXEL_IMAGE_TESTS === "1" ? describe : describe.skip;
const sandboxName = `codegen-image-${Date.now()}`;

describeLive("code generation image", () => {
  afterAll(async () => {
    await SandboxInstance.delete(sandboxName).catch(() => undefined);
  });

  it("runs the required toolchain as a non-root workload user", async () => {
    const image = process.env.BL_SANDBOX_IMAGE?.trim();
    if (!image) throw new Error("BL_SANDBOX_IMAGE is required");
    const sandbox = await SandboxInstance.createIfNotExists({
      name: sandboxName,
      image,
      memory: 4096,
      region: process.env.BL_REGION?.trim() || "us-pdx-1",
      lifecycle: {
        expirationPolicies: [
          { type: "ttl-max-age", value: "1h", action: "delete" },
        ],
      },
    });

    const result = await sandbox.process.exec({
      name: "verify-image",
      command: "test \"$(id -u)\" != 0 && command -v node npm tar unzip",
      workingDir: "/workspace",
      waitForCompletion: true,
      timeout: 60,
    });

    expect(result.exitCode).toBe(0);
    expect(result.status).toBe("completed");
  }, 180_000);
});
